import {
  BaseRepository,
  type FilterValue,
  type QueryOptions,
  type PaginatedResult,
  type PaginationOptions,
} from "@/lib/repositories/base-repository";
import type { AnomalyScore } from "@/lib/supabase/types";
import {
  buildCacheKey,
  parseSearchQuery,
  optimizeQuery,
  type QueryBuilder,
  type FilterOption,
} from "@/lib/repositories/query-utils";

const DEFAULT_ANOMALY_SELECT = `
  id,
  feature_vector_id,
  device_id,
  model_id,
  score,
  label,
  threshold_applied,
  above_threshold,
  inference_latency_ms,
  connectivity_state,
  organization_id,
  integrity_hash,
  created_at,
  scored_at
`.trim();

export interface GetAnomalyScoresOptions extends QueryOptions {
  deviceId: string;
  limit?: number;
  orderBy?: {
    column: "created_at" | "score";
    ascending?: boolean;
  };
  search?: string;
}

export interface AnomalyAnalytics {
  deviceId: string;
  currentScore: number;
  baselineScore: number;
  deviation: number;
  trend: "improving" | "stable" | "degrading";
  history: AnomalyScore[];
}

export interface AnomalyTrend {
  direction: "up" | "down" | "stable";
  magnitude: number;
  confidence: number;
}

export class AnomalyRepository extends BaseRepository<AnomalyScore> {
  constructor() {
    super("anomaly_scores");
    this.schema = "telemetry";
  }

  async getAnomalyScores(
    options: GetAnomalyScoresOptions,
  ): Promise<AnomalyScore[]> {
    const queryBuilder: QueryBuilder = {
      select: DEFAULT_ANOMALY_SELECT,
      filters: [
        { field: "device_id", operator: "eq", value: options.deviceId },
      ],
      sorts: options.orderBy
        ? [
            {
              field: options.orderBy.column,
              direction: options.orderBy.ascending ? "asc" : "desc",
            },
          ]
        : [{ field: "created_at", direction: "desc" }],
      limit: options.limit ?? 20,
      cacheKey: options.cacheKey,
      cacheTTL: options.cacheTTL ?? 5 * 60 * 1000,
    };

    if (options.search) {
      const searchFilters = parseSearchQuery(options.search, ["label"]);
      queryBuilder.filters?.push(...searchFilters);
    }

    const optimizedQuery = optimizeQuery(queryBuilder);
    const cacheKey =
      options.cacheKey ?? buildCacheKey("anomaly_scores", optimizedQuery);

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildQuery({
          select: optimizedQuery.select,
          filters: this.convertFilters(optimizedQuery.filters),
          orderBy: optimizedQuery.sorts?.[0]
            ? {
                column: optimizedQuery.sorts[0].field,
                ascending: optimizedQuery.sorts[0].direction === "asc",
              }
            : undefined,
          limit: optimizedQuery.limit,
        });

        if (error) throw this.handleError(error);
        return (data ?? []) as unknown as AnomalyScore[];
      },
      { ttl: optimizedQuery.cacheTTL },
    );
  }

  async getLatestAnomalyScore(deviceId: string): Promise<AnomalyScore | null> {
    return this.findOne(
      { device_id: deviceId },
      {
        orderBy: { column: "created_at", ascending: false },
        cacheTTL: 2 * 60 * 1000,
      },
    );
  }

  async getAnomalyScoresInTimeframe(
    deviceId: string,
    startTime: string,
    endTime: string,
  ): Promise<AnomalyScore[]> {
    return this.findMany({
      select: DEFAULT_ANOMALY_SELECT,
      filters: {
        device_id: deviceId,
        created_at: { gte: startTime, lte: endTime },
      },
      orderBy: { column: "created_at", ascending: true },
      cacheTTL: 10 * 60 * 1000,
    });
  }

  async getAnomalyScoresWithPagination(
    options: GetAnomalyScoresOptions & PaginationOptions,
  ): Promise<PaginatedResult<AnomalyScore>> {
    const queryBuilder: QueryBuilder = {
      filters: [
        { field: "device_id", operator: "eq", value: options.deviceId },
      ],
      sorts: options.orderBy
        ? [
            {
              field: options.orderBy.column,
              direction: options.orderBy.ascending ? "asc" : "desc",
            },
          ]
        : [{ field: "created_at", direction: "desc" }],
      limit: options.limit,
      cacheTTL: 5 * 60 * 1000,
    };

    if (options.search) {
      const searchFilters = parseSearchQuery(options.search, ["label"]);
      queryBuilder.filters?.push(...searchFilters);
    }

    const optimizedQuery = optimizeQuery(queryBuilder);

    return this.findPaginated({
      page: options.page,
      limit: options.limit,
      select: DEFAULT_ANOMALY_SELECT,
      filters: this.convertFilters(optimizedQuery.filters),
      orderBy: optimizedQuery.sorts?.[0]
        ? {
            column: optimizedQuery.sorts[0].field,
            ascending: optimizedQuery.sorts[0].direction === "asc",
          }
        : undefined,
      cacheTTL: optimizedQuery.cacheTTL,
    });
  }

  async getAnomalyAnalytics(
    deviceId: string,
    timeframe: "24h" | "7d" | "30d" = "24h",
  ): Promise<AnomalyAnalytics | null> {
    // Calculate the time cutoff based on timeframe
    const now = new Date();
    const cutoff = new Date();

    switch (timeframe) {
      case "24h":
        cutoff.setHours(now.getHours() - 24);
        break;
      case "7d":
        cutoff.setDate(now.getDate() - 7);
        break;
      case "30d":
        cutoff.setDate(now.getDate() - 30);
        break;
    }

    const scores = await this.getAnomalyScoresInTimeframe(
      deviceId,
      cutoff.toISOString(),
      now.toISOString(),
    );

    if (scores.length === 0) {
      return null;
    }

    const currentScore = scores[scores.length - 1]?.score ?? 0;

    // Calculate baseline (average of first 70% of data, excluding most recent 30%)
    const baselineCutoffIndex = Math.floor(scores.length * 0.7);
    const baselineScores = scores.slice(0, baselineCutoffIndex);
    const baselineScore =
      baselineScores.length > 0
        ? baselineScores.reduce((sum, s) => sum + s.score, 0) /
          baselineScores.length
        : 0.1;

    const deviation = currentScore - baselineScore;

    // Determine trend based on recent vs older scores
    const recentScores = scores.slice(-Math.min(10, scores.length));
    const olderScores = scores.slice(
      0,
      Math.min(10, scores.length - recentScores.length),
    );

    let trend: "improving" | "stable" | "degrading" = "stable";
    if (recentScores.length > 0 && olderScores.length > 0) {
      const recentAvg =
        recentScores.reduce((sum, s) => sum + s.score, 0) / recentScores.length;
      const olderAvg =
        olderScores.reduce((sum, s) => sum + s.score, 0) / olderScores.length;

      if (recentAvg < olderAvg - 0.05) {
        trend = "improving";
      } else if (recentAvg > olderAvg + 0.05) {
        trend = "degrading";
      }
    }

    return {
      deviceId,
      currentScore,
      baselineScore,
      deviation,
      trend,
      history: scores,
    };
  }

  async getAnomalyTrend(
    deviceId: string,
    hours: number = 24,
  ): Promise<AnomalyTrend | null> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);

    const scores = await this.getAnomalyScoresInTimeframe(
      deviceId,
      cutoff.toISOString(),
      new Date().toISOString(),
    );

    if (scores.length < 2) {
      return null;
    }

    // Simple linear regression to determine trend
    const n = scores.length;
    const sumX = scores.reduce((sum, _, i) => sum + i, 0);
    const sumY = scores.reduce((sum, s) => sum + s.score, 0);
    const sumXY = scores.reduce((sum, s, i) => sum + i * s.score, 0);
    const sumX2 = scores.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared for confidence
    const meanY = sumY / n;
    const totalSumSquares = scores.reduce(
      (sum, s) => sum + Math.pow(s.score - meanY, 2),
      0,
    );
    const residualSumSquares = scores.reduce((sum, s, i) => {
      const predicted = slope * i + intercept;
      return sum + Math.pow(s.score - predicted, 2);
    }, 0);

    const rSquared = 1 - residualSumSquares / totalSumSquares;
    const confidence = Math.max(0, Math.min(1, rSquared));

    let direction: "up" | "down" | "stable" = "stable";
    if (Math.abs(slope) > 0.001) {
      direction = slope > 0 ? "up" : "down";
    }

    return {
      direction,
      magnitude: Math.abs(slope),
      confidence,
    };
  }

  async getAnomalyScoresForMultipleDevices(
    deviceIds: string[],
    options: Omit<GetAnomalyScoresOptions, "deviceId"> = {},
  ): Promise<Record<string, AnomalyScore[]>> {
    if (deviceIds.length === 0) return {};

    const ids = [...new Set(deviceIds)];

    const { data, error } = await this.buildQuery({
      select: DEFAULT_ANOMALY_SELECT,
      filters: { device_id: { in: ids } },
      orderBy: options.orderBy ?? { column: "created_at", ascending: false },
      limit: options.limit ?? 20,
    });

    if (error) throw this.handleError(error);

    const scores = (data ?? []) as unknown as AnomalyScore[];
    const results: Record<string, AnomalyScore[]> = {};

    for (const id of ids) {
      results[id] = scores.filter((s) => s.device_id === id);
    }

    return results;
  }

  async cleanupOldAnomalyScores(olderThanDays: number = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const { data, error } = await this.supabase
      .from(this.tableName)
      .delete()
      .lt("created_at", cutoff.toISOString())
      .select("count");

    if (error) throw this.handleError(error);

    // Clear cache after cleanup
    this.invalidateCache();

    return data?.length || 0;
  }

  private convertFilters(filters?: FilterOption[]): Record<string, FilterValue> {
    if (!filters) return {};

    const result: Record<string, FilterValue> = {};

    for (const filter of filters) {
      const { field, operator, value } = filter;
      switch (operator) {
        case "eq":
          result[field] = value;
          break;
        case "ne":
        case "gt":
        case "gte":
        case "lt":
        case "lte":
        case "like":
        case "ilike":
          result[field] = { [operator]: value };
          break;
        case "in":
          result[field] = { in: value };
          break;
      }
    }

    return result;
  }
}
