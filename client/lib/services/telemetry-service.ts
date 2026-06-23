import type { SupabaseClient } from "@supabase/supabase-js";

export interface TelemetrySample {
  collected_at: string;
  cpu_percent: number;
  ram_percent: number;
}

export interface GetTelemetryOptions {
  deviceId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  orderBy?: "collected_at" | "received_at" | "created_at";
  orderDirection?: "asc" | "desc";
}

interface TelemetryData {
  collected_at: string;
  payload: Record<string, unknown>;
}

export class TelemetryService {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async getTelemetry(
    options: GetTelemetryOptions = {},
  ): Promise<{ data: TelemetrySample[] | null; error: Error | null }> {
    try {
      let query = this.supabaseClient
        .schema("telemetry")
        .from("events")
        .select("collected_at, payload");

      if (options.deviceId) {
        query = query.eq("device_id", options.deviceId);
      }

      if (options.startDate) {
        query = query.gte("collected_at", options.startDate);
      }

      if (options.endDate) {
        query = query.lte("collected_at", options.endDate);
      }

      const orderBy = options.orderBy || "collected_at";
      const orderDirection = options.orderDirection || "desc";
      query = query.order(orderBy, { ascending: orderDirection === "asc" });

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;
      if (error) {
        return {
          data: null,
          error: error instanceof Error ? error : new Error(error),
        };
      }

      return {
        data: (data || []).map((t: TelemetryData) => {
          const payload = t.payload as {
            cpu_percent?: number;
            ram_percent?: number;
          };
          return {
            collected_at: t.collected_at,
            cpu_percent: payload.cpu_percent ?? 0,
            ram_percent: payload.ram_percent ?? 0,
          };
        }),
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get telemetry"),
      };
    }
  }

  public async getLatestTelemetry(
    deviceId: string,
    limit = 48,
  ): Promise<{ data: TelemetrySample[] | null; error: Error | null }> {
    try {
      return await this.getTelemetry({
        deviceId,
        limit,
        orderBy: "collected_at",
        orderDirection: "desc",
      });
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get latest telemetry"),
      };
    }
  }

  public async getTelemetryByTimeRange(
    deviceId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ data: TelemetrySample[] | null; error: Error | null }> {
    try {
      return await this.getTelemetry({
        deviceId,
        startDate,
        endDate,
        orderBy: "collected_at",
        orderDirection: "asc",
      });
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get telemetry by time range"),
      };
    }
  }

  public async getAverageCpuUsage(
    deviceId: string,
    hours = 24,
  ): Promise<{ data: number | null; error: Error | null }> {
    try {
      const startDate = new Date(
        Date.now() - hours * 60 * 60 * 1000,
      ).toISOString();

      const result = await this.getTelemetry({
        deviceId,
        startDate,
        orderBy: "collected_at",
        orderDirection: "desc",
        limit: 100,
      });

      if (result.error) return { data: null, error: result.error };

      const telemetry = result.data ?? [];
      if (telemetry.length === 0) return { data: 0, error: null };

      const totalCpu = telemetry.reduce((sum, t) => sum + t.cpu_percent, 0);
      return { data: Math.round(totalCpu / telemetry.length), error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get average CPU usage"),
      };
    }
  }

  public async getAverageRamUsage(
    deviceId: string,
    hours = 24,
  ): Promise<{ data: number | null; error: Error | null }> {
    try {
      const startDate = new Date(
        Date.now() - hours * 60 * 60 * 1000,
      ).toISOString();

      const result = await this.getTelemetry({
        deviceId,
        startDate,
        orderBy: "collected_at",
        orderDirection: "desc",
        limit: 100,
      });

      if (result.error) return { data: null, error: result.error };

      const telemetry = result.data ?? [];
      if (telemetry.length === 0) return { data: 0, error: null };

      const totalRam = telemetry.reduce((sum, t) => sum + t.ram_percent, 0);
      return { data: Math.round(totalRam / telemetry.length), error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get average RAM usage"),
      };
    }
  }

  public async getTelemetryMetrics(
    deviceId: string,
  ): Promise<{
    data: {
      avgCpu: number;
      avgRam: number;
      maxCpu: number;
      maxRam: number;
      samples: number;
    } | null;
    error: Error | null;
  }> {
    try {
      const result = await this.getLatestTelemetry(deviceId, 100);

      if (result.error) return { data: null, error: result.error };

      const telemetry = result.data ?? [];

      if (telemetry.length === 0) {
        return {
          data: { avgCpu: 0, avgRam: 0, maxCpu: 0, maxRam: 0, samples: 0 },
          error: null,
        };
      }

      const cpuValues = telemetry.map((t) => t.cpu_percent);
      const ramValues = telemetry.map((t) => t.ram_percent);

      return {
        data: {
          avgCpu: Math.round(
            cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length,
          ),
          avgRam: Math.round(
            ramValues.reduce((a, b) => a + b, 0) / ramValues.length,
          ),
          maxCpu: Math.max(...cpuValues),
          maxRam: Math.max(...ramValues),
          samples: telemetry.length,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get telemetry metrics"),
      };
    }
  }
}
