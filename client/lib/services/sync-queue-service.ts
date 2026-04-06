import { SyncQueueRepository } from '@/lib/repositories';
import type {
  SyncQueueSubscriptionCallbacks,
} from '@/lib/repositories/sync-queue-repository';
import type { DeviceSyncQueueSummary } from '@/lib/supabase/types';
import type { SyncQueueItem } from '@/lib/repositories/sync-queue-repository';

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
  private channelName: string | null = null;

  constructor(private readonly repository: SyncQueueRepository) { }

  async getSyncQueueItems(options: GetSyncQueueOptions = {}): Promise<SyncQueueItem[]> {
    return this.repository.findSyncQueueItems({
      deviceId: options.deviceId,
      status: options.status,
      startDate: options.startDate,
      endDate: options.endDate,
      limit: options.limit,
      orderBy: { column: 'queued_at', ascending: false },
    });
  }

  async getDeviceSyncQueueSummaries(): Promise<DeviceSyncQueueSummary[]> {
    return this.repository.getDeviceSyncQueueSummaries();
  }

  async getSyncQueueByDevice(deviceId: string, limit = 50): Promise<SyncQueueItem[]> {
    return this.repository.getSyncQueueByDevice(deviceId, limit);
  }

  async getPendingSyncQueueItems(): Promise<SyncQueueItem[]> {
    return this.repository.getPendingSyncQueueItems();
  }

  async getFailedSyncQueueItems(): Promise<SyncQueueItem[]> {
    return this.repository.getFailedSyncQueueItems();
  }

  async getSyncQueueMetrics(): Promise<{
    totalPending: number;
    totalFailed: number;
    devicesWithIssues: number;
    oldestPendingAge: number | null;
  }> {
    return this.repository.getSyncQueueMetrics();
  }

  subscribeToSyncQueue(callbacks: SyncQueueSubscriptionOptions): void {
    if (this.channelName) {
      this.repository.unsubscribeFromSyncQueue(this.channelName);
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
        callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      },
    };

    this.channelName = this.repository.subscribeToSyncQueue({}, repoCallbacks);
  }

  unsubscribeFromSyncQueue(): void {
    if (this.channelName) {
      this.repository.unsubscribeFromSyncQueue(this.channelName);
      this.channelName = null;
    }
  }
}
