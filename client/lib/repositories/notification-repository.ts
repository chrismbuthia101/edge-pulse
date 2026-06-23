import type { SupabaseClient, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Notification } from "@/lib/types/notifications";

type FilterValue = string | number | boolean | string[];

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface NotificationQueryOptions {
  select?: string;
  orderBy?: { column: string; ascending: boolean };
  limit?: number;
  offset?: number;
  userId?: string;
  organizationId?: string;
  read?: boolean;
  severity?: "low" | "medium" | "high" | "critical";
  category?: string;
  startDate?: string;
  endDate?: string;
}

export interface NotificationSubscriptionCallbacks {
  onInsert?: (notification: Notification) => void;
  onUpdate?: (notification: Notification) => void;
  onError?: (error: unknown) => void;
}

export class NotificationRepository {
  private readonly schema = "public";
  private readonly tableName = "notifications";

  constructor(private readonly supabaseClient: SupabaseClient) {}

  async findNotifications(
    options: NotificationQueryOptions = {},
  ): Promise<{ data: Notification[] | null; error: Error | null }> {
    try {
      const query = this.buildNotificationQuery(options);
      const { data, error } = await query;
      if (error) throw error;
      return { data: (data ?? []) as unknown as Notification[], error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to find notifications"),
      };
    }
  }

  public async findNotificationsPaginated(
    options: NotificationQueryOptions & { page: number; limit: number },
  ): Promise<{ data: PaginatedResult<Notification> | null; error: Error | null }> {
    try {
      const { page, limit, ...queryOptions } = options;
      const offset = (page - 1) * limit;

      let countQuery = this.supabaseClient
        .from(this.tableName)
        .select("*", { count: "exact", head: true });

      if (queryOptions.userId) countQuery = countQuery.eq("user_id", queryOptions.userId);
      if (queryOptions.organizationId) countQuery = countQuery.eq("organization_id", queryOptions.organizationId);
      if (queryOptions.read !== undefined) countQuery = countQuery.eq("read", queryOptions.read);
      if (queryOptions.severity) countQuery = countQuery.eq("severity", queryOptions.severity);
      if (queryOptions.category) countQuery = countQuery.eq("category", queryOptions.category);

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      const filters: Record<string, FilterValue> = {};
      if (queryOptions.userId) filters.user_id = queryOptions.userId;
      if (queryOptions.organizationId) filters.organization_id = queryOptions.organizationId;
      if (queryOptions.read !== undefined) filters.read = queryOptions.read;
      if (queryOptions.severity) filters.severity = queryOptions.severity;
      if (queryOptions.category) filters.category = queryOptions.category;

      let query = this.supabaseClient
        .from(this.tableName)
        .select(queryOptions.select ?? "*")
        .order(queryOptions.orderBy?.column ?? "created_at", {
          ascending: queryOptions.orderBy?.ascending ?? false,
        });

      for (const [key, value] of Object.entries(filters)) {
        if (Array.isArray(value)) {
          query = query.in(key, value);
        } else {
          query = query.eq(key, value as string | number | boolean);
        }
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) throw error;

      const totalPages = Math.ceil((count ?? 0) / limit);

      return {
        data: {
          data: (data ?? []) as unknown as Notification[],
          count: count ?? 0,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to find notifications paginated"),
      };
    }
  }

  public async getUnreadNotifications(
    userId: string,
    organizationId: string,
  ): Promise<{ data: Notification[] | null; error: Error | null }> {
    return this.findNotifications({
      userId,
      organizationId,
      read: false,
      orderBy: { column: "created_at", ascending: false },
      limit: 50,
    });
  }

  public async getUnreadCount(
    userId: string,
    organizationId: string,
  ): Promise<{ data: number | null; error: Error | null }> {
    try {
      const { count, error } = await this.supabaseClient
        .from(this.tableName)
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .eq("read", false);

      if (error) throw error;
      return { data: count ?? 0, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to get unread count"),
      };
    }
  }

  public async markAsRead(
    id: string,
  ): Promise<{ data: Notification | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .from(this.tableName)
        .update({ read: true, read_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { data: data as unknown as Notification, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to mark as read"),
      };
    }
  }

  public async markAllAsRead(
    userId: string,
    organizationId: string,
  ): Promise<{ data: null; error: Error | null }> {
    try {
      const { error } = await this.supabaseClient
        .from(this.tableName)
        .update({ read: true, read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .eq("read", false);

      if (error) throw error;
      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to mark all as read"),
      };
    }
  }

  public subscribeToNotifications(
    filters: Record<string, FilterValue> = {},
    callbacks: NotificationSubscriptionCallbacks = {},
  ): { data: string | null; error: Error | null } {
    try {
      const channelName = `realtime-notifications-${Date.now()}`;
      const filterString = this.buildFilterString(filters);

      this.supabaseClient
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: this.schema,
            table: this.tableName,
            filter: filterString,
          },
          (payload: RealtimePostgresChangesPayload<Notification>) => {
            try {
              const p = payload as {
                eventType: string;
                new?: Notification;
                old?: Notification;
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
          },
        )
        .subscribe();

      return { data: channelName, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to subscribe to notifications"),
      };
    }
  }

  public unsubscribeFromNotifications(
    channelName: string,
  ): { data: null; error: Error | null } {
    try {
      const channel = this.supabaseClient
        .getChannels()
        .find((c) => c.topic === channelName);
      if (channel) {
        this.supabaseClient.removeChannel(channel);
      }
      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to unsubscribe from notifications"),
      };
    }
  }

  private buildNotificationQuery(options: NotificationQueryOptions) {
    const standardFilters: Record<string, FilterValue> = {};

    if (options.userId) standardFilters.user_id = options.userId;
    if (options.organizationId) standardFilters.organization_id = options.organizationId;
    if (options.read !== undefined) standardFilters.read = options.read;
    if (options.severity) standardFilters.severity = options.severity;
    if (options.category) standardFilters.category = options.category;

    let query = this.supabaseClient
      .from(this.tableName)
      .select(options.select ?? "*")
      .order(options.orderBy?.column ?? "created_at", {
        ascending: options.orderBy?.ascending ?? false,
      });

    for (const [key, value] of Object.entries(standardFilters)) {
      if (Array.isArray(value)) {
        query = query.in(key, value);
      } else {
        query = query.eq(key, value as string | number | boolean);
      }
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.range(options.offset, options.offset + (options.limit ?? 20) - 1);

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
