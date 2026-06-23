import { LiveRepository } from "@/lib/repositories";
import type {
  LiveStats,
  LiveQueryOptions,
  LiveSubscriptionHandles,
} from "@/lib/repositories/live-repository";
import type { Alert } from "@/lib/types/alerts";
import type { TelemetryEvent } from "@/lib/types/telemetry";
import type { Result } from "@/lib/types/shared";

export interface LiveSubscriptionOptions {
  onNewAlert?: (alert: Alert) => void;
  onNewTelemetry?: (telemetry: TelemetryEvent) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (connected: boolean) => void;
}

export interface LiveFeedData {
  alerts: Alert[];
  telemetry: TelemetryEvent[];
  stats: LiveStats;
}

export class LiveService {
  private readonly repository: LiveRepository;
  private activeHandles: LiveSubscriptionHandles | null = null;

  constructor(repository: LiveRepository) {
    this.repository = repository;
  }

  public async getRecentAlerts(
    options: LiveQueryOptions = {},
  ): Promise<Result<Alert[]>> {
    const { data, error } = await this.repository.getRecentAlerts(options);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getTodayStats(): Promise<Result<LiveStats>> {
    const { data, error } = await this.repository.getTodayStats();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getRecentTelemetry(
    options: LiveQueryOptions = {},
  ): Promise<Result<TelemetryEvent[]>> {
    const { data, error } = await this.repository.getRecentTelemetry(options);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public subscribeToLiveFeed(
    options: LiveSubscriptionOptions = {},
  ): Result<LiveSubscriptionHandles> {
    if (this.activeHandles) {
      this.repository.unsubscribeFromLiveFeed(this.activeHandles);
      this.activeHandles = null;
    }

    const { data, error } = this.repository.subscribeToLiveFeed(options);
    if (error || !data) {
      return { success: false, error: error?.message ?? "No subscription handle" };
    }
    this.activeHandles = data;
    return { success: true, data };
  }

  public unsubscribeFromLiveFeed(): Result<void> {
    if (this.activeHandles) {
      this.repository.unsubscribeFromLiveFeed(this.activeHandles);
      this.activeHandles = null;
    }
    return { success: true, data: undefined };
  }

  public async initializeLiveFeed(): Promise<Result<LiveFeedData>> {
    const [alertsResult, telemetryResult, statsResult] = await Promise.all([
      this.getRecentAlerts(),
      this.getRecentTelemetry(),
      this.getTodayStats(),
    ]);

    if (!alertsResult.success) return alertsResult;
    if (!telemetryResult.success) return telemetryResult;
    if (!statsResult.success) return statsResult;

    return {
      success: true,
      data: {
        alerts: alertsResult.data,
        telemetry: telemetryResult.data,
        stats: statsResult.data,
      },
    };
  }
}

import { createClient } from "@/lib/config/client";
export const liveService = new LiveService(new LiveRepository(createClient()));
