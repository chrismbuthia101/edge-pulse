import type {
  SupabaseClient,
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import type { SyncQueueEntry, DeviceSyncQueueSummary } from "@/lib/types/sync";

type FilterValue = string | number | boolean | string[];

export interface SyncQueueQueryOptions {
  select?: string;
  orderBy?: { column: string; ascending: boolean };
  limit?: number;
  offset?: number;
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

const TABLE_NAME = "sync_queue";
const SCHEMA = "internal";

export class SyncQueueRepository {
  private readonly channels = new Map<string, RealtimeChannel>();

  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async findSyncQueueItems(
    options: SyncQueueQueryOptions = {},
  ): Promise<{ data: SyncQueueEntry[] | null; error: Error | null }> {
    try {
      const query = this.buildSyncQueueQuery(options);
      const { data, error } = await query;
      if (error) throw error;
      return { data: (data ?? []) as unknown as SyncQueueEntry[], error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find sync queue items"),
      };
    }
  }

  public async getDeviceSyncQueueSummaries(
    organizationId?: string,
  ): Promise<{ data: DeviceSyncQueueSummary[] | null; error: Error | null }> {
    try {
      let query = this.supabaseClient
        .schema(SCHEMA)
        .from(TABLE_NAME)
        .select(
          `
          device_id,
          status,
          created_at,
          devices!inner ( name )
        `,
        )
        .in("status", ["PENDING", "FAILED"]);

      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;

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
        if (row.status === "PENDING") existing.pending_count++;
        if (row.status === "FAILED") existing.failed_count++;
        if (
          !existing.oldest_queued_at ||
          row.created_at < existing.oldest_queued_at
        ) {
          existing.oldest_queued_at = row.created_at;
        }
        map.set(row.device_id, existing);
      }
      return { data: Array.from(map.values()), error: null };
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
  ): Promise<{ data: SyncQueueEntry[] | null; error: Error | null }> {
    return this.findSyncQueueItems({
      deviceId,
      orderBy: { column: "created_at", ascending: false },
      limit,
    });
  }

  public async getPendingSyncQueueItems(): Promise<{
    data: SyncQueueEntry[] | null;
    error: Error | null;
  }> {
    return this.findSyncQueueItems({
      status: "PENDING",
      orderBy: { column: "created_at", ascending: false },
    });
  }

  public async getFailedSyncQueueItems(): Promise<{
    data: SyncQueueEntry[] | null;
    error: Error | null;
  }> {
    return this.findSyncQueueItems({
      status: "FAILED",
      orderBy: { column: "created_at", ascending: false },
    });
  }

  public async getSyncQueueMetrics(organizationId?: string): Promise<{
    data: {
      totalPending: number;
      totalFailed: number;
      devicesWithIssues: number;
      oldestPendingAge: number | null;
    } | null;
    error: Error | null;
  }> {
    try {
      const summariesResult =
        await this.getDeviceSyncQueueSummaries(organizationId);
      if (summariesResult.error) throw summariesResult.error;

      const summaries = summariesResult.data ?? [];

      const totalPending = summaries.reduce(
        (sum, s) => sum + s.pending_count,
        0,
      );
      const totalFailed = summaries.reduce((sum, s) => sum + s.failed_count, 0);
      const devicesWithIssues = summaries.filter(
        (s) => s.pending_count > 0 || s.failed_count > 0,
      ).length;

      const oldestPendingAge = summaries
        .filter((s) => s.oldest_queued_at)
        .map((s) => Date.now() - new Date(s.oldest_queued_at!).getTime())
        .reduce((min, age) => Math.min(min, age), Infinity);

      return {
        data: {
          totalPending,
          totalFailed,
          devicesWithIssues,
          oldestPendingAge:
            oldestPendingAge === Infinity
              ? null
              : Math.floor(oldestPendingAge / 60000),
        },
        error: null,
      };
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
    filters: Record<string, FilterValue> = {},
    callbacks: SyncQueueSubscriptionCallbacks = {},
  ): { data: string | null; error: Error | null } {
    try {
      const channelName = "realtime-sync-queue";
      const filterString = this.buildFilterString(filters);

      const existing = this.channels.get(channelName);
      if (existing) {
        this.supabaseClient.removeChannel(existing);
        this.channels.delete(channelName);
      }

      const channel = this.supabaseClient
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: SCHEMA,
            table: TABLE_NAME,
            filter: filterString,
          },
          (payload: RealtimePostgresChangesPayload<SyncQueueEntry>) => {
            try {
              const p = payload as {
                eventType: string;
                new?: SyncQueueEntry;
                old?: SyncQueueEntry;
              };
              switch (p.eventType) {
                case "INSERT":
                  callbacks.onInsert?.(p.new!);
                  break;
                case "UPDATE":
                  callbacks.onUpdate?.(p.new!);
                  break;
                case "DELETE":
                  callbacks.onDelete?.(p.old!);
                  break;
              }
            } catch (error) {
              callbacks.onError?.(error);
            }
          },
        )
        .subscribe();

      this.channels.set(channelName, channel);
      return { data: channelName, error: null };
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

  public unsubscribeFromSyncQueue(channelName: string): {
    data: null;
    error: Error | null;
  } {
    try {
      const name = channelName ?? "realtime-sync-queue";
      const channel = this.channels.get(name);
      if (channel) {
        this.supabaseClient.removeChannel(channel);
        this.channels.delete(name);
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

  private buildSyncQueueQuery(options: SyncQueueQueryOptions) {
    const standardFilters: Record<string, FilterValue> = {};

    if (options.deviceId) standardFilters.device_id = options.deviceId;
    if (options.status) standardFilters.status = options.status;
    if (options.organizationId)
      standardFilters.organization_id = options.organizationId;

    let query = this.supabaseClient
      .schema(SCHEMA)
      .from(TABLE_NAME)
      .select(options.select ?? "*");

    if (options.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending,
      });
    }

    for (const [key, value] of Object.entries(standardFilters)) {
      if (Array.isArray(value)) {
        query = query.in(key, value);
      } else {
        query = query.eq(key, value as string | number | boolean);
      }
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset)
      query = query.range(
        options.offset,
        options.offset + (options.limit ?? 20) - 1,
      );

    if (options.startDate) query = query.gte("created_at", options.startDate);
    if (options.endDate) query = query.lte("created_at", options.endDate);

    return query;
  }

  private buildFilterString(filters: Record<string, FilterValue>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(filters)) {
      if (Array.isArray(value)) {
        parts.push(`${key}=in.(${value.join(",")})`);
      } else {
        parts.push(`${key}=eq.${value}`);
      }
    }
    return parts.join(" and ");
  }
}
