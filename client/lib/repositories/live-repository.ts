import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import type { Alert } from "@/lib/types/alerts";
import type { TelemetryEvent } from "@/lib/types/telemetry";

export interface LiveQueryOptions {
  startDate?: string;
  endDate?: string;
}

export interface LiveSubscriptionCallbacks {
  onNewAlert?: (alert: Alert) => void;
  onNewTelemetry?: (telemetry: TelemetryEvent) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (connected: boolean) => void;
}

export interface LiveStats {
  total: number;
  critical: number;
  blocked: number;
}

export interface LiveSubscriptionHandles {
  alertsChannel: string;
  telemetryChannel: string;
}

export class LiveRepository {
  private readonly alertsTable = "alerts";
  private readonly eventsTable = "events";
  private readonly alertsSchema = "public";
  private readonly telemetrySchema = "telemetry";
  private readonly channels = new Map<string, RealtimeChannel>();

  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async getRecentAlerts(
    options: LiveQueryOptions = {},
  ): Promise<{ data: Alert[]; error: Error | null }> {
    try {
      let query = this.supabaseClient
        .from(this.alertsTable)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (options.startDate)
        query = query.gte("created_at", options.startDate);
      if (options.endDate)
        query = query.lte("created_at", options.endDate);

      const { data, error } = await query;
      if (error) throw error;
      return { data: (data ?? []) as unknown as Alert[], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get recent alerts"),
      };
    }
  }

  public async getTodayStats(): Promise<{ data: LiveStats; error: Error | null }> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: alerts, error } = await this.supabaseClient
        .from(this.alertsTable)
        .select("severity, status, created_at")
        .gte("created_at", today.toISOString());

      if (error) throw error;

      if (!alerts) {
        return { data: { total: 0, critical: 0, blocked: 0 }, error: null };
      }

      const total = alerts.length;
      const critical = alerts.filter(
        (a: { severity: string }) => a.severity === "critical",
      ).length;
      const blocked = alerts.filter(
        (a: { status: string }) => a.status === "CLOSED",
      ).length;

      return { data: { total, critical, blocked }, error: null };
    } catch (error) {
      return {
        data: { total: 0, critical: 0, blocked: 0 },
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get today stats"),
      };
    }
  }

  public async getRecentTelemetry(
    options: LiveQueryOptions = {},
  ): Promise<{ data: TelemetryEvent[]; error: Error | null }> {
    try {
      let query = this.supabaseClient
        .schema(this.telemetrySchema)
        .from(this.eventsTable)
        .select("*")
        .order("collected_at", { ascending: false })
        .limit(50);

      if (options.startDate)
        query = query.gte("collected_at", options.startDate);
      if (options.endDate)
        query = query.lte("collected_at", options.endDate);

      const { data, error } = await query;
      if (error) throw error;

      if (!data || !Array.isArray(data)) {
        return { data: [], error: null };
      }

      const telemetryData = data as unknown as TelemetryEvent[];
      const deviceIds = [
        ...new Set(telemetryData.map((t) => t.device_id)),
      ];

      const { data: devices } = await this.supabaseClient
        .from("devices")
        .select("id, name")
        .in("id", deviceIds);

      const deviceMap = new Map(
        (devices ?? []).map(
          (d: { id: string; name: string }) => [d.id, d.name],
        ),
      );

      return {
        data: telemetryData.map((telemetry) => ({
          ...telemetry,
          device_name: deviceMap.get(telemetry.device_id),
        })) as unknown as TelemetryEvent[],
        error: null,
      };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get recent telemetry"),
      };
    }
  }

  public subscribeToLiveFeed(
    callbacks: LiveSubscriptionCallbacks = {},
  ): { data: LiveSubscriptionHandles | null; error: Error | null } {
    const { onNewAlert, onNewTelemetry, onError, onStatusChange } =
      callbacks;

    try {
      const alertChannelName = "live-feed-alerts";
      const existingAlert = this.channels.get(alertChannelName);
      if (existingAlert) {
        this.supabaseClient.removeChannel(existingAlert);
        this.channels.delete(alertChannelName);
      }

      const alertChannel: RealtimeChannel = this.supabaseClient
        .channel(alertChannelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: this.alertsSchema,
            table: this.alertsTable,
          },
          (payload) => {
            try {
              if (payload.new) {
                onNewAlert?.(payload.new as Alert);
              }
            } catch (error) {
              onError?.(
                error instanceof Error
                  ? error
                  : new Error("Unknown error in alert subscription"),
              );
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED" || status === "CLOSED") {
            onStatusChange?.(status === "SUBSCRIBED");
          }
        });
      this.channels.set(alertChannelName, alertChannel);

      const telemetryChannelName = "live-feed-telemetry";
      const existingTelemetry = this.channels.get(telemetryChannelName);
      if (existingTelemetry) {
        this.supabaseClient.removeChannel(existingTelemetry);
        this.channels.delete(telemetryChannelName);
      }

      const telemetryChannel: RealtimeChannel = this.supabaseClient
        .channel(telemetryChannelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: this.telemetrySchema,
            table: this.eventsTable,
          },
          (payload) => {
            try {
              if (payload.new) {
                onNewTelemetry?.(payload.new as TelemetryEvent);
              }
            } catch (error) {
              onError?.(
                error instanceof Error
                  ? error
                  : new Error("Unknown error in telemetry subscription"),
              );
            }
          },
        )
        .subscribe();
      this.channels.set(telemetryChannelName, telemetryChannel);

      return {
        data: {
          alertsChannel: alertChannel.topic,
          telemetryChannel: telemetryChannel.topic,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to subscribe to live feed"),
      };
    }
  }

  public unsubscribeFromLiveFeed(handles: LiveSubscriptionHandles): void {
    for (const handle of Object.values(handles)) {
      const channel = this.channels.get(handle);
      if (channel) {
        this.supabaseClient.removeChannel(channel);
        this.channels.delete(handle);
      }
    }
  }
}
