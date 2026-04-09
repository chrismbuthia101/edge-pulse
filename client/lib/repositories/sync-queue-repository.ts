import {
  BaseRepository,
  type QueryOptions,
} from '@/lib/repositories/base-repository';
import type { DeviceSyncQueueSummary } from '@/lib/supabase/types';

export interface SyncQueueItem {
  id: string;
  device_id: string;
  status: string;
  queued_at: string;
  processed_at?: string;
  error_message?: string;
  retry_count?: number;
  data?: Record<string, unknown>;
}

export interface SyncQueueQueryOptions extends QueryOptions {
  deviceId?: string;
  status?: string | string[];
  startDate?: string;
  endDate?: string;
}

export interface SyncQueueSubscriptionCallbacks {
  onInsert?: (queue: SyncQueueItem) => void;
  onUpdate?: (queue: SyncQueueItem) => void;
  onDelete?: (queue: SyncQueueItem) => void;
  onError?: (error: unknown) => void;
}

export class SyncQueueRepository extends BaseRepository {
  constructor() {
    super('sync_queue');
  }

  private buildSyncQueueQuery(options: SyncQueueQueryOptions) {
    const standardFilters: Record<string, unknown> = {};

    if (options.deviceId) standardFilters.device_id = options.deviceId;
    if (options.status) standardFilters.status = options.status;

    let query = this.buildQuery({
      select: options.select ?? '*',
      filters: standardFilters,
      orderBy: options.orderBy,
      limit: options.limit,
      offset: options.offset,
    });

    if (options.startDate) query = query.gte('queued_at', options.startDate);
    if (options.endDate) query = query.lte('queued_at', options.endDate);

    return query;
  }

  async findSyncQueueItems(options: SyncQueueQueryOptions = {}): Promise<SyncQueueItem[]> {
    const cacheKey = options.cacheKey ?? `sync_queue_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildSyncQueueQuery(options);
        if (error) throw this.handleError(error);
        return (data ?? []) as unknown as SyncQueueItem[];
      },
      options.cacheTTL
    );
  }

  async getDeviceSyncQueueSummaries(): Promise<DeviceSyncQueueSummary[]> {
    const cacheKey = 'device_sync_queue_summaries';

    return this.cachedQuery(
      cacheKey,
      async () => {
        // Aggregate sync_queue by device_id joining device_registry for the name
        const { data, error } = await this.supabase
          .from('sync_queue')
          .select(`
            device_id,
            status,
            queued_at,
            device_registry!inner ( name )
          `)
          .in('status', ['PENDING', 'FAILED']);

        if (error) throw this.handleError(error);

        // Build per-device summary client-side
        const map = new Map<string, DeviceSyncQueueSummary>();
        for (const row of (data ?? []) as unknown as Array<{
          device_id: string;
          status: string;
          queued_at: string;
          device_registry: { name: string };
        }>) {
          const existing = map.get(row.device_id) ?? {
            device_id: row.device_id,
            device_name: row.device_registry?.name ?? row.device_id,
            pending_count: 0,
            failed_count: 0,
            oldest_queued_at: null,
          };
          if (row.status === 'PENDING') existing.pending_count++;
          if (row.status === 'FAILED') existing.failed_count++;
          if (
            !existing.oldest_queued_at ||
            row.queued_at < existing.oldest_queued_at
          ) {
            existing.oldest_queued_at = row.queued_at;
          }
          map.set(row.device_id, existing);
        }
        return Array.from(map.values());
      },
      30 * 1000 // 30 seconds cache
    );
  }

  async getSyncQueueByDevice(deviceId: string, limit = 50): Promise<SyncQueueItem[]> {
    return this.findSyncQueueItems({
      deviceId,
      orderBy: { column: 'queued_at', ascending: false },
      limit,
      cacheTTL: 2 * 60 * 1000,
    });
  }

  async getPendingSyncQueueItems(): Promise<SyncQueueItem[]> {
    return this.findSyncQueueItems({
      status: 'PENDING',
      orderBy: { column: 'queued_at', ascending: false },
      cacheTTL: 30 * 1000,
    });
  }

  async getFailedSyncQueueItems(): Promise<SyncQueueItem[]> {
    return this.findSyncQueueItems({
      status: 'FAILED',
      orderBy: { column: 'queued_at', ascending: false },
      cacheTTL: 30 * 1000,
    });
  }

  async getSyncQueueMetrics(): Promise<{
    totalPending: number;
    totalFailed: number;
    devicesWithIssues: number;
    oldestPendingAge: number | null;
  }> {
    const cacheKey = 'sync_queue_metrics';

    return this.cachedQuery(
      cacheKey,
      async () => {
        const summaries = await this.getDeviceSyncQueueSummaries();

        const totalPending = summaries.reduce((sum, s) => sum + s.pending_count, 0);
        const totalFailed = summaries.reduce((sum, s) => sum + s.failed_count, 0);
        const devicesWithIssues = summaries.filter(s => s.pending_count > 0 || s.failed_count > 0).length;

        // Calculate age of oldest pending item in minutes
        const oldestPendingAge = summaries
          .filter(s => s.oldest_queued_at)
          .map(s => Date.now() - new Date(s.oldest_queued_at!).getTime())
          .reduce((min, age) => Math.min(min, age), Infinity);

        return {
          totalPending,
          totalFailed,
          devicesWithIssues,
          oldestPendingAge: oldestPendingAge === Infinity ? null : Math.floor(oldestPendingAge / 60000),
        };
      },
      60 * 1000 // 1 minute cache
    );
  }

  // ── Realtime ───────────────────────────────────────────────────────────────

  subscribeToSyncQueue(
    filters: Partial<SyncQueueQueryOptions> = {},
    callbacks: SyncQueueSubscriptionCallbacks = {}
  ): string {
    const channelName = `realtime-sync-queue-${Date.now()}`;

    this.subscribe(channelName, filters, (payload) => {
      try {
        const p = payload as { eventType: string; new?: SyncQueueItem; old?: SyncQueueItem };
        switch (p.eventType) {
          case 'INSERT': callbacks.onInsert?.(p.new!); break;
          case 'UPDATE': callbacks.onUpdate?.(p.new!); break;
          case 'DELETE': callbacks.onDelete?.(p.old!); break;
        }
      } catch (error) {
        callbacks.onError?.(error);
      }
    });

    return channelName;
  }

  unsubscribeFromSyncQueue(channelName: string): void {
    this.unsubscribe(channelName);
  }
}
