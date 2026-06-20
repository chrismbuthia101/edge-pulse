import { HealthRepository } from "@/lib/repositories";
import type { DeviceHealthSnapshot, SystemHealth } from "@/lib/supabase/types";

export interface HealthServiceDependencies {
  repository: HealthRepository;
}

export class HealthService {
  private repository: HealthRepository;

  constructor(dependencies: HealthServiceDependencies) {
    this.repository = dependencies.repository;
  }

  async getDeviceHealth(options?: {
    limit?: number;
  }): Promise<DeviceHealthSnapshot[]> {
    return this.repository.getDeviceHealth(options);
  }

  async getSystemHealth(): Promise<SystemHealth | null> {
    return this.repository.getSystemHealth();
  }

  async refreshDeviceHealth(): Promise<DeviceHealthSnapshot[]> {
    return this.getDeviceHealth({ limit: 100 });
  }

  subscribeToHealthUpdates(callbacks: {
    onDeviceHealthUpdate?: (device: DeviceHealthSnapshot) => void;
    onError?: (error: Error) => void;
  }): string {
    const channelName = "realtime-health";
    const channel = this.repository["supabase"]
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "telemetry",
          table: "device_health",
        },
        (payload: unknown) => {
          try {
            const p = payload as {
              eventType: string;
              new: Record<string, unknown>;
              old: Record<string, unknown>;
            };
            if (p.eventType === "INSERT" || p.eventType === "UPDATE") {
              const snapshot = p.new as unknown as DeviceHealthSnapshot;
              callbacks.onDeviceHealthUpdate?.(snapshot);
            }
          } catch (error) {
            callbacks.onError?.(
              error instanceof Error ? error : new Error("Unknown error"),
            );
          }
        },
      )
      .subscribe();

    this.repository["subscriptions"].add(channelName, channel);
    return channelName;
  }

  unsubscribeFromHealthUpdates(channelName?: string): void {
    this.repository.unsubscribe(channelName ?? "realtime-health");
  }
}
