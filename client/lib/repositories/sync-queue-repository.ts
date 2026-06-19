import {
  BaseRepository,
  type QueryOptions,
} from '@/lib/repositories/base-repository';
import type { SyncQueueEntry, DeviceSyncQueueSummary } from '@/lib/supabase/types';

export interface SyncQueueQueryOptions extends QueryOptions {
  deviceId?: string;
  status?: string | string[];
  startDate?: string;
  endDate?: string;
  organizationId?: string;
}

export interface SyncQueueSubscriptionCallbacks {
  onInsert?: (queue: SyncQueueEntry) => void;
  onUpdate?: (queue: SyncQueueEntry) => void;
  onDelete?: (queue: SyncQueueEntry) => void;
  onError?: (error: unknown) => void;
}

export type SyncQueueItem = SyncQueueEntry;

export class SyncQueueRepository extends BaseRepository<SyncQueueEntry> {
  constructor() {
    super('sync_queue');
    this.schema = 'internal';
  }

  private buildSyncQueueQuery(options: SyncQueueQueryOptions) {
    const standardFilters: Record<string, unknown> = {};

    if (options.deviceId) standardFilters.device_id = options.deviceId;
    if (options.status) standardFilters.status = options.status;
    if (options.organizationId) standardFilters.organization_id = options.organizationId;

    let query = this.buildQuery({
      select: options.select ?? '*',
      filters: standardFilters,
      orderBy: options.orderBy,
      limit: options.limit,
      offset: options.offset,
    });

    if (options.startDate) query = query.gte('created_at', options.startDate);
    if (options.endDate) query = query.lte('created_at', options.endDate);

    return query;
  }

  async findSyncQueueItems(options: SyncQueueQueryOptions = {}): Promise<SyncQueueEntry[]> {
    const cacheKey = options.cacheKey ?? `sync_queue_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildSyncQueueQuery(options);
        if (error) throw this.handleError(error);
        return (data ?? []) as unknown as SyncQueueEntry[];
      },
      options.cacheTTL
    );
  }

  async getDeviceSyncQueueSummaries(organizationId?: string): Promise<DeviceSyncQueueSummary[]> {
    const cacheKey = `device_sync_queue_summaries_${organizationId || 'all'}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        let query = this.getClient()
          .from(this.tableName)
          .select(`
            device_id,
            status,
            created_at,
            devices!inner ( name )
          `)
          .in('status', ['PENDING', 'FAILED']);

        if (organizationId) {
          query = query.eq('organization_id', organizationId);
        }

        const { data, error } = await query;
        if (error) throw this.handleError(error);

        const map = new Map<string, DeviceSyncQueueSummary>();
        for (const row of (data ?? []) as unknown as Array<{
          device_id: string;
          status: string;
          created_at: string;
          devices: { name: string };
        }>) {
          const existing = map.get(row.device_id) ?? {
            device_id: row.device_id,
            device_name: row.devices?.name ?? row.device_id,
            pending_count: 0,
            failed_count: 0,
            oldest_queued_at: null,
          };
          if (row.status === 'PENDING') existing.pending_count++;
          if (row.status === 'FAILED') existing.failed_count++;
          if (
            !existing.oldest_queued_at ||
            row.created_at < existing.oldest_queued_at
          ) {
            existing.oldest_queued_at = row.created_at;
          }
          map.set(row.device_id, existing);
        }
        return Array.from(map.values());
      },
      30 * 1000
    );
  }

  async getSyncQueueByDevice(deviceId: string, limit = 50): Promise<SyncQueueEntry[]> {
    return this.findSyncQueueItems({
      deviceId,
      orderBy: { column: 'created_at', ascending: false },
      limit,
      cacheTTL: 2 * 60 * 1000,
    });
  }

  async getPendingSyncQueueItems(): Promise<SyncQueueEntry[]> {
    return this.findSyncQueueItems({
      status: 'PENDING',
      orderBy: { column: 'created_at', ascending: false },
      cacheTTL: 30 * 1000,
    });
  }

  async getFailedSyncQueueItems(): Promise<SyncQueueEntry[]> {
    return this.findSyncQueueItems({
      status: 'FAILED',
      orderBy: { column: 'created_at', ascending: false },
      cacheTTL: 30 * 1000,
    });
  }

  async getSyncQueueMetrics(organizationId?: string): Promise<{
    totalPending: number;
    totalFailed: number;
    devicesWithIssues: number;
    oldestPendingAge: number | null;
  }> {
    const cacheKey = `sync_queue_metrics_${organizationId || 'all'}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const summaries = await this.getDeviceSyncQueueSummaries(organizationId);

        const totalPending = summaries.reduce((sum, s) => sum + s.pending_count, 0);
        const totalFailed = summaries.reduce((sum, s) => sum + s.failed_count, 0);
        const devicesWithIssues = summaries.filter(s => s.pending_count > 0 || s.failed_count > 0).length;

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
      60 * 1000
    );
  }

  subscribeToSyncQueue(
    filters: Partial<SyncQueueQueryOptions> = {},
    callbacks: SyncQueueSubscriptionCallbacks = {}
  ): string {
    const channelName = `realtime-sync-queue-${Date.now()}`;

    this.subscribe(channelName, filters, (payload) => {
      try {
        const p = payload as { eventType: string; new?: SyncQueueEntry; old?: SyncQueueEntry };
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
