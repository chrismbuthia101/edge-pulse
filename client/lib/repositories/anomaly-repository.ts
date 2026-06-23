import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnomalyScore, AnomalyAnalytics, GetAnomalyScoresOptions } from "@/lib/types/anomaly";

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

const TABLE_NAME = "anomaly_scores";

export class AnomalyRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async getAnomalyScores(
    options: GetAnomalyScoresOptions,
  ): Promise<{ data: AnomalyScore[]; error: Error | null }> {
    try {
      let query = this.supabaseClient
        .schema("telemetry")
        .from(TABLE_NAME)
        .select(DEFAULT_ANOMALY_SELECT)
        .eq("device_id", options.deviceId)
        .order(options.orderBy?.column || "created_at", {
          ascending: options.orderBy?.ascending ?? false,
        })
        .limit(options.limit ?? 20);

      if (options.search) {
        const terms = options.search.split(" ").filter(Boolean);
        if (terms.length > 0) {
          query = query.or(
            terms.map((t) => `label.ilike.%${t}%`).join(","),
          );
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return { data: (data ?? []) as unknown as AnomalyScore[], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get anomaly scores"),
      };
    }
  }

  public async getLatestAnomalyScore(
    deviceId: string,
  ): Promise<{ data: AnomalyScore | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("telemetry")
        .from(TABLE_NAME)
        .select(DEFAULT_ANOMALY_SELECT)
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return { data: data as unknown as AnomalyScore | null, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get latest anomaly score"),
      };
    }
  }

  public async getAnomalyScoresInTimeframe(
    deviceId: string,
    startTime: string,
    endTime: string,
  ): Promise<{ data: AnomalyScore[]; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("telemetry")
        .from(TABLE_NAME)
        .select(DEFAULT_ANOMALY_SELECT)
        .eq("device_id", deviceId)
        .gte("created_at", startTime)
        .lte("created_at", endTime)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return { data: (data ?? []) as unknown as AnomalyScore[], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get anomaly scores in timeframe"),
      };
    }
  }

  public async getAnomalyAnalytics(
    deviceId: string,
    timeframe: "24h" | "7d" | "30d" = "24h",
  ): Promise<{ data: AnomalyAnalytics | null; error: Error | null }> {
    try {
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

      const { data: scores, error: scoresError } =
        await this.getAnomalyScoresInTimeframe(
          deviceId,
          cutoff.toISOString(),
          now.toISOString(),
        );
      if (scoresError) throw scoresError;

      if (scores.length === 0) {
        return { data: null, error: null };
      }

      const currentScore = scores[scores.length - 1]?.score ?? 0;

      const baselineCutoffIndex = Math.floor(scores.length * 0.7);
      const baselineScores = scores.slice(0, baselineCutoffIndex);
      const baselineScore =
        baselineScores.length > 0
          ? baselineScores.reduce((sum, s) => sum + s.score, 0) /
            baselineScores.length
          : 0.1;

      const deviation = currentScore - baselineScore;

      const recentScores = scores.slice(-Math.min(10, scores.length));
      const olderScores = scores.slice(
        0,
        Math.min(10, scores.length - recentScores.length),
      );

      let trend: "improving" | "stable" | "degrading" = "stable";
      if (recentScores.length > 0 && olderScores.length > 0) {
        const recentAvg =
          recentScores.reduce((sum, s) => sum + s.score, 0) /
          recentScores.length;
        const olderAvg =
          olderScores.reduce((sum, s) => sum + s.score, 0) /
          olderScores.length;

        if (recentAvg < olderAvg - 0.05) {
          trend = "improving";
        } else if (recentAvg > olderAvg + 0.05) {
          trend = "degrading";
        }
      }

      return {
        data: {
          deviceId,
          currentScore,
          baselineScore,
          deviation,
          trend,
          history: scores,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get anomaly analytics"),
      };
    }
  }
}
