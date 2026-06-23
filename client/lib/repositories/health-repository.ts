import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeviceHealthSnapshot,
  DeviceHealthRow,
  SystemHealth,
} from "@/lib/types/health";

const TABLE_NAME = "device_health";

export class HealthRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async getDeviceHealth(options?: {
    limit?: number;
    organizationId?: string;
  }): Promise<{ data: DeviceHealthSnapshot[]; error: Error | null }> {
    try {
      const limit = options?.limit || 100;

      let query = this.supabaseClient
        .schema("telemetry")
        .from(TABLE_NAME)
        .select(
          `
          *,
          devices:device_id (
            name,
            os,
            agent_version,
            is_active,
            last_seen
          )
        `,
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (options?.organizationId) {
        query = query.eq("organization_id", options.organizationId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const seenDevices = new Set<string>();
      const uniqueRows = (data || []).filter((row) => {
        const snapshot = row as DeviceHealthRow;
        if (seenDevices.has(snapshot.device_id)) {
          return false;
        }
        seenDevices.add(snapshot.device_id);
        return true;
      });

      return {
        data: uniqueRows as unknown as DeviceHealthSnapshot[],
        error: null,
      };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get device health"),
      };
    }
  }

  public async getDeviceById(
    deviceId: string,
  ): Promise<{ data: DeviceHealthSnapshot | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("telemetry")
        .from(TABLE_NAME)
        .select(
          `
          *,
          devices:device_id (
            name,
            os,
            agent_version,
            is_active,
            last_seen
          )
        `,
        )
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === "PGRST116") return { data: null, error: null };
        throw error;
      }

      return { data: data as unknown as DeviceHealthSnapshot, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get device by ID"),
      };
    }
  }

  public async getLatestHealthSnapshot(
    deviceId: string,
  ): Promise<{ data: DeviceHealthSnapshot | null; error: Error | null }> {
    return this.getDeviceById(deviceId);
  }

  public async getSystemHealth(
    organizationId?: string,
  ): Promise<{ data: SystemHealth; error: Error | null }> {
    try {
      const { data: deviceHealth, error: healthError } =
        await this.getDeviceHealth({
          limit: 1000,
          organizationId,
        });
      if (healthError) throw healthError;

      if (deviceHealth.length === 0) {
        return {
          data: {
            total_devices: 0,
            online_devices: 0,
            offline_devices: 0,
            warning_devices: 0,
            error_devices: 0,
            avg_cpu_usage: 0,
            avg_memory_usage: 0,
            avg_disk_usage: 0,
            total_alerts: 0,
            total_alerts_24h: 0,
            critical_alerts_24h: 0,
            system_uptime: 0,
            api_response_time: 0,
            system_status: "HEALTHY" as const,
            last_updated: new Date().toISOString(),
          },
          error: null,
        };
      }

      const onlineCount = deviceHealth.filter(
        (d) => d.status === "ONLINE",
      ).length;
      const offlineCount = deviceHealth.filter(
        (d) => d.status === "OFFLINE",
      ).length;
      const warningCount = deviceHealth.filter(
        (d) => d.status === "WARNING",
      ).length;
      const errorCount = deviceHealth.filter(
        (d) => d.status === "ERROR",
      ).length;

      const totalCpu = deviceHealth.reduce(
        (sum, d) => sum + (d.cpu_usage ?? 0),
        0,
      );
      const totalMemory = deviceHealth.reduce(
        (sum, d) => sum + (d.memory_usage ?? 0),
        0,
      );
      const totalDisk = deviceHealth.reduce(
        (sum, d) => sum + (d.disk_usage ?? 0),
        0,
      );
      const totalAlerts = deviceHealth.reduce(
        (sum, d) => sum + d.alerts_last_24h,
        0,
      );

      const n = deviceHealth.length;
      const avgCpu = totalCpu / n;
      const avgMemory = totalMemory / n;
      const avgDisk = totalDisk / n;

      let systemStatus: "HEALTHY" | "WARNING" | "CRITICAL" = "HEALTHY";
      if (errorCount > 0) systemStatus = "CRITICAL";
      else if (
        warningCount > 0 ||
        avgCpu > 80 ||
        avgMemory > 80 ||
        avgDisk > 80
      )
        systemStatus = "WARNING";

      return {
        data: {
          total_devices: n,
          online_devices: onlineCount,
          offline_devices: offlineCount,
          warning_devices: warningCount,
          error_devices: errorCount,
          avg_cpu_usage: avgCpu,
          avg_memory_usage: avgMemory,
          avg_disk_usage: avgDisk,
          total_alerts: totalAlerts,
          total_alerts_24h: totalAlerts,
          critical_alerts_24h: 0,
          system_uptime: 0,
          api_response_time: 0,
          system_status: systemStatus,
          last_updated: new Date().toISOString(),
        },
        error: null,
      };
    } catch (error) {
      return {
        data: {
          total_devices: 0,
          online_devices: 0,
          offline_devices: 0,
          warning_devices: 0,
          error_devices: 0,
          avg_cpu_usage: 0,
          avg_memory_usage: 0,
          avg_disk_usage: 0,
          total_alerts: 0,
          total_alerts_24h: 0,
          critical_alerts_24h: 0,
          system_uptime: 0,
          api_response_time: 0,
          system_status: "HEALTHY" as const,
          last_updated: new Date().toISOString(),
        },
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get system health"),
      };
    }
  }

  public subscribeToHealthUpdates(callbacks: {
    onInsert?: (device: DeviceHealthSnapshot) => void;
    onUpdate?: (device: DeviceHealthSnapshot) => void;
    onError?: (error: unknown) => void;
  }): string {
    const channel = this.supabaseClient.channel("realtime-health");

    channel.on(
      "postgres_changes",
      { event: "*", schema: "telemetry", table: TABLE_NAME },
      (payload) => {
        try {
          const p = payload as {
            eventType: string;
            new: Record<string, unknown>;
            old: Record<string, unknown>;
          };
          if (p.eventType === "INSERT") {
            callbacks.onInsert?.(p.new as unknown as DeviceHealthSnapshot);
          } else if (p.eventType === "UPDATE") {
            callbacks.onUpdate?.(p.new as unknown as DeviceHealthSnapshot);
          }
        } catch (error) {
          callbacks.onError?.(error);
        }
      },
    );

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" && callbacks.onError) {
        callbacks.onError(new Error("Channel subscription error"));
      }
    });

    return channel.topic;
  }

  public unsubscribeFromHealthUpdates(channelName?: string): void {
    const topic = channelName ?? "realtime-health";
    const channel = this.supabaseClient
      .getChannels()
      .find((c) => c.topic === topic);

    if (channel) {
      this.supabaseClient.removeChannel(channel);
    }
  }
}
