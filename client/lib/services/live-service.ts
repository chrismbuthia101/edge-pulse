import { LiveRepository } from "@/lib/repositories";
import type {
  LiveStats,
  LiveQueryOptions,
} from "@/lib/repositories/live-repository";
import type { Alert, TelemetryEvent } from "@/lib/supabase/types";

export interface LiveSubscriptionOptions {
  onNewAlert?: (alert: Alert) => void;
  onNewTelemetry?: (telemetry: TelemetryEvent) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (connected: boolean) => void;
}

export class LiveService {
  private cleanup: (() => void) | null = null;

  constructor(private readonly repository: LiveRepository) {}

  async getRecentAlerts(options: LiveQueryOptions = {}): Promise<Alert[]> {
    return this.repository.getRecentAlerts(options);
  }

  async getTodayStats(): Promise<LiveStats> {
    return this.repository.getTodayStats();
  }

  async getRecentTelemetry(
    options: LiveQueryOptions = {},
  ): Promise<TelemetryEvent[]> {
    return this.repository.getRecentTelemetry(options);
  }

  subscribeToLiveFeed(options: LiveSubscriptionOptions = {}): void {
    if (this.cleanup) {
      this.unsubscribeFromLiveFeed();
    }

    this.cleanup = this.repository.subscribeToLiveFeed(options);
  }

  unsubscribeFromLiveFeed(): void {
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = null;
    }
  }

  async initializeLiveFeed(): Promise<{
    alerts: Alert[];
    telemetry: TelemetryEvent[];
    stats: LiveStats;
  }> {
    const [alerts, telemetry, stats] = await Promise.all([
      this.getRecentAlerts(),
      this.getRecentTelemetry(),
      this.getTodayStats(),
    ]);

    return { alerts, telemetry, stats };
  }
}
