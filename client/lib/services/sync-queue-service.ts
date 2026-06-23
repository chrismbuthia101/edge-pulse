import type { SupabaseClient } from "@supabase/supabase-js";
import { SyncQueueRepository } from "@/lib/repositories";
import type { SyncQueueSubscriptionCallbacks } from "@/lib/repositories/sync-queue-repository";
import type { DeviceSyncQueueSummary } from "@/lib/types/sync";
import type { SyncQueueItem } from "@/lib/repositories/sync-queue-repository";

export interface GetSyncQueueOptions {
  limit?: number;
  deviceId?: string;
  status?: string | string[];
  startDate?: string;
  endDate?: string;
}

export interface SyncQueueSubscriptionOptions {
  onNewItem?: (queue: SyncQueueItem) => void;
  onItemUpdated?: (queue: SyncQueueItem) => void;
  onItemDeleted?: (queue: SyncQueueItem) => void;
  onError?: (error: Error) => void;
}

export class SyncQueueService {
  private readonly repository: SyncQueueRepository;
  private channelName: string | null = null;

  constructor(supabaseClient: SupabaseClient) {
    this.repository = new SyncQueueRepository(supabaseClient);
  }

  public async getSyncQueueItems(
    options: GetSyncQueueOptions = {},
  ): Promise<{ data: SyncQueueItem[] | null; error: Error | null }> {
    try {
      return await this.repository.findSyncQueueItems({
        deviceId: options.deviceId,
        status: options.status,
        startDate: options.startDate,
        endDate: options.endDate,
        limit: options.limit,
        orderBy: { column: "queued_at", ascending: false },
      });
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get sync queue items"),
      };
    }
  }

  public async getDeviceSyncQueueSummaries(): Promise<{
    data: DeviceSyncQueueSummary[] | null;
    error: Error | null;
  }> {
    try {
      return await this.repository.getDeviceSyncQueueSummaries();
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get device sync queue summaries"),
      };
    }
  }

  public async getSyncQueueByDevice(
    deviceId: string,
    limit = 50,
  ): Promise<{ data: SyncQueueItem[] | null; error: Error | null }> {
    try {
      return await this.repository.getSyncQueueByDevice(deviceId, limit);
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get sync queue by device"),
      };
    }
  }

  public async getPendingSyncQueueItems(): Promise<{
    data: SyncQueueItem[] | null;
    error: Error | null;
  }> {
    try {
      return await this.repository.getPendingSyncQueueItems();
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get pending sync queue items"),
      };
    }
  }

  public async getFailedSyncQueueItems(): Promise<{
    data: SyncQueueItem[] | null;
    error: Error | null;
  }> {
    try {
      return await this.repository.getFailedSyncQueueItems();
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get failed sync queue items"),
      };
    }
  }

  public async getSyncQueueMetrics(): Promise<{
    data: {
      totalPending: number;
      totalFailed: number;
      devicesWithIssues: number;
      oldestPendingAge: number | null;
    } | null;
    error: Error | null;
  }> {
    try {
      return await this.repository.getSyncQueueMetrics();
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get sync queue metrics"),
      };
    }
  }

  public subscribeToSyncQueue(
    callbacks: SyncQueueSubscriptionOptions,
  ): { data: string | null; error: Error | null } {
    try {
      if (this.channelName) {
        const result = this.repository.unsubscribeFromSyncQueue(
          this.channelName,
        );
        if (result.error) throw result.error;
      }

      const repoCallbacks: SyncQueueSubscriptionCallbacks = {
        onInsert: (queue) => {
          callbacks.onNewItem?.(queue);
        },
        onUpdate: (queue) => {
          callbacks.onItemUpdated?.(queue);
        },
        onDelete: (queue) => {
          callbacks.onItemDeleted?.(queue);
        },
        onError: (err) => {
          callbacks.onError?.(
            err instanceof Error ? err : new Error(String(err)),
          );
        },
      };

      const result = this.repository.subscribeToSyncQueue({}, repoCallbacks);
      if (result.error) throw result.error;

      this.channelName = result.data;
      return result;
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to subscribe to sync queue"),
      };
    }
  }

  public unsubscribeFromSyncQueue(): { data: null; error: Error | null } {
    try {
      if (this.channelName) {
        const result = this.repository.unsubscribeFromSyncQueue(
          this.channelName,
        );
        if (result.error) throw result.error;
        this.channelName = null;
      }
      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to unsubscribe from sync queue"),
      };
    }
  }
}
