import {
  BaseRepository,
  type QueryOptions,
  type PaginatedResult,
  type PaginationOptions,
} from "@/lib/repositories/base-repository";
import type { NotificationRow } from "@/lib/supabase/types/database";

export interface NotificationQueryOptions extends QueryOptions {
  userId?: string;
  organizationId?: string;
  read?: boolean;
  severity?: "low" | "medium" | "high" | "critical";
  category?: string;
  startDate?: string;
  endDate?: string;
}

export interface NotificationSubscriptionCallbacks {
  onInsert?: (notification: NotificationRow) => void;
  onUpdate?: (notification: NotificationRow) => void;
  onError?: (error: unknown) => void;
}

export class NotificationRepository extends BaseRepository<NotificationRow> {
  constructor() {
    super("notifications");
  }

  private buildNotificationQuery(options: NotificationQueryOptions) {
    const standardFilters: Record<string, unknown> = {};

    if (options.userId) standardFilters.user_id = options.userId;
    if (options.organizationId)
      standardFilters.organization_id = options.organizationId;
    if (options.read !== undefined) standardFilters.read = options.read;
    if (options.severity) standardFilters.severity = options.severity;
    if (options.category) standardFilters.category = options.category;

    let query = this.buildQuery({
      select: options.select ?? "*",
      filters: standardFilters,
      orderBy: options.orderBy ?? { column: "created_at", ascending: false },
      limit: options.limit,
      offset: options.offset,
    });

    if (options.startDate) query = query.gte("created_at", options.startDate);
    if (options.endDate) query = query.lte("created_at", options.endDate);

    return query;
  }

  async findNotifications(
    options: NotificationQueryOptions = {},
  ): Promise<NotificationRow[]> {
    const cacheKey =
      options.cacheKey ?? `notifications_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildNotificationQuery(options);
        if (error) throw this.handleError(error);
        return (data ?? []) as unknown as NotificationRow[];
      },
      options.cacheTTL,
    );
  }

  async findNotificationsPaginated(
    options: NotificationQueryOptions & PaginationOptions,
  ): Promise<PaginatedResult<NotificationRow>> {
    const { page, limit, ...queryOptions } = options;

    const filters: Record<string, unknown> = {};
    if (queryOptions.userId) filters.user_id = queryOptions.userId;
    if (queryOptions.organizationId)
      filters.organization_id = queryOptions.organizationId;
    if (queryOptions.read !== undefined) filters.read = queryOptions.read;
    if (queryOptions.severity) filters.severity = queryOptions.severity;
    if (queryOptions.category) filters.category = queryOptions.category;

    return this.findPaginated({
      page,
      limit,
      select: queryOptions.select ?? "*",
      filters,
      orderBy: queryOptions.orderBy ?? {
        column: "created_at",
        ascending: false,
      },
      cacheTTL: queryOptions.cacheTTL,
    });
  }

  async getUnreadNotifications(
    userId: string,
    organizationId: string,
  ): Promise<NotificationRow[]> {
    return this.findNotifications({
      userId,
      organizationId,
      read: false,
      orderBy: { column: "created_at", ascending: false },
      limit: 50,
      cacheTTL: 30 * 1000,
    });
  }

  async getUnreadCount(
    userId: string,
    organizationId: string,
  ): Promise<number> {
    const cacheKey = `unread_count_${userId}_${organizationId}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { count, error } = await this.getClient()
          .from(this.tableName)
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("organization_id", organizationId)
          .eq("read", false);

        if (error) throw this.handleError(error);
        return count ?? 0;
      },
      15 * 1000,
    );
  }

  async markAsRead(id: string): Promise<NotificationRow> {
    return this.update(id, {
      read: true,
      read_at: new Date().toISOString(),
    } as Partial<NotificationRow>);
  }

  async markAllAsRead(userId: string, organizationId: string): Promise<void> {
    try {
      const { error } = await this.getClient()
        .from(this.tableName)
        .update({ read: true, read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .eq("read", false);

      if (error) throw error;
      this.invalidateCache();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  subscribeToNotifications(
    filters: Partial<NotificationQueryOptions> = {},
    callbacks: NotificationSubscriptionCallbacks = {},
  ): string {
    const channelName = `realtime-notifications-${Date.now()}`;

    this.subscribe(channelName, filters, (payload) => {
      try {
        const p = payload as {
          eventType: string;
          new?: NotificationRow;
          old?: NotificationRow;
        };
        switch (p.eventType) {
          case "INSERT":
            callbacks.onInsert?.(p.new!);
            break;
          case "UPDATE":
            callbacks.onUpdate?.(p.new!);
            break;
        }
      } catch (error) {
        callbacks.onError?.(error);
      }
    });

    return channelName;
  }

  unsubscribeFromNotifications(channelName: string): void {
    this.unsubscribe(channelName);
  }
}
