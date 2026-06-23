import type { SupabaseClient } from "@supabase/supabase-js";
import { ResilienceRepository } from "@/lib/repositories/resilience-repository";
import type {
  ConnectionMetrics,
  ResilienceMetrics,
  OfflineEfficiencyMetrics
} from "@/lib/repositories/resilience-repository";

export class ResilienceService {
  private readonly repository: ResilienceRepository;

  constructor(supabaseClient: SupabaseClient) {
    this.repository = new ResilienceRepository(supabaseClient);
  }

  public async getConnectionMetrics(): Promise<{
    data: ConnectionMetrics[] | null;
    error: Error | null;
  }> {
    try {
      return await this.repository.getConnectionMetrics();
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get connection metrics"),
      };
    }
  }

  public async getResilienceMetrics(): Promise<{
    data: ResilienceMetrics | null;
    error: Error | null;
  }> {
    try {
      return await this.repository.getResilienceMetrics();
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get resilience metrics"),
      };
    }
  }

  public async getOfflineEfficiencyMetrics(timeRange: "24h" | "7d" = "24h"): Promise<{
    data: OfflineEfficiencyMetrics[] | null;
    error: Error | null;
  }> {
    try {
      return await this.repository.getOfflineEfficiencyMetrics(timeRange);
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get offline efficiency metrics"),
      };
    }
  }

  public async getDeviceConnectionHistory(
    deviceId: string,
    timeRange: "24h" | "7d" = "24h",
  ): Promise<{
    data: Array<{
      device_id: string;
      status: string;
      uptime_percentage: number;
      response_time_ms: number;
      created_at: string;
    }> | null;
    error: Error | null;
  }> {
    try {
      return await this.repository.getDeviceConnectionHistory(
        deviceId,
        timeRange,
      );
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get device connection history"),
      };
    }
  }

  public async getAggregatedEfficiencyMetrics(
    timeRange: "24h" | "7d" = "24h",
  ): Promise<{
    data: {
      totalOfflineDuration: number;
      averageSyncSuccessRate: number;
      averageLatency: number;
      totalItemsQueued: number;
      dataIntegrityRate: number;
      devicesWithOfflinePeriods: number;
    } | null;
    error: Error | null;
  }> {
    try {
      const result = await this.getOfflineEfficiencyMetrics(timeRange);
      if (result.error) return { data: null, error: result.error };

      const metrics = result.data ?? [];

      const totalOfflineDuration = metrics.reduce(
        (sum, m) => sum + m.offline_duration_minutes,
        0,
      );
      const averageSyncSuccessRate =
        metrics.length > 0
          ? metrics.reduce((sum, m) => sum + m.sync_success_rate, 0) /
            metrics.length
          : 100;
      const averageLatency =
        metrics.length > 0
          ? metrics.reduce((sum, m) => sum + m.average_sync_latency_ms, 0) /
            metrics.length
          : 0;
      const totalItemsQueued = metrics.reduce(
        (sum, m) => sum + m.items_queued_during_offline,
        0,
      );
      const dataIntegrityRate =
        metrics.length > 0
          ? (metrics.filter((m) => m.data_integrity_verified).length /
              metrics.length) *
            100
          : 100;
      const devicesWithOfflinePeriods = metrics.filter(
        (m) => m.offline_duration_minutes > 0,
      ).length;

      return {
        data: {
          totalOfflineDuration: Math.round(totalOfflineDuration),
          averageSyncSuccessRate: Math.round(averageSyncSuccessRate * 10) / 10,
          averageLatency: Math.round(averageLatency),
          totalItemsQueued,
          dataIntegrityRate: Math.round(dataIntegrityRate * 10) / 10,
          devicesWithOfflinePeriods,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get aggregated efficiency metrics"),
      };
    }
  }

  public async getPerformanceTrends(timeRange: "24h" | "7d" = "24h"): Promise<{
    data: {
      uptimeTrend: Array<{ timestamp: string; value: number }>;
      latencyTrend: Array<{ timestamp: string; value: number }>;
      queueDepthTrend: Array<{ timestamp: string; value: number }>;
    } | null;
    error: Error | null;
  }> {
    try {
      const result = await this.getOfflineEfficiencyMetrics(timeRange);
      if (result.error) return { data: null, error: result.error };

      const efficiencyMetrics = result.data ?? [];

      const now = new Date();
      const startTime =
        timeRange === "24h"
          ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
          : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const uptimeTrend = efficiencyMetrics.map((m) => ({
        timestamp: m.last_offline_period?.start || startTime.toISOString(),
        value: m.sync_success_rate,
      }));

      const latencyTrend = efficiencyMetrics.map((m) => ({
        timestamp: m.last_offline_period?.start || startTime.toISOString(),
        value: m.average_sync_latency_ms,
      }));

      const queueDepthTrend = efficiencyMetrics.map((m) => ({
        timestamp: m.last_offline_period?.start || startTime.toISOString(),
        value: m.items_queued_during_offline,
      }));

      return {
        data: {
          uptimeTrend,
          latencyTrend,
          queueDepthTrend,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get performance trends"),
      };
    }
  }
}
