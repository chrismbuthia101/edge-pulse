import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export interface QueryOptions {
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  filters?: Record<string, unknown>;
  cacheKey?: string;
  cacheTTL?: number;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export abstract class BaseRepository<T = Record<string, unknown>> {
  protected supabase: AnySupabaseClient = createClient();
  protected cache = new Map<string, CacheEntry>();
  protected subscriptions = new Map<string, RealtimeChannel>();
  protected schema: string = 'public';

  constructor(protected tableName: string) { }

  protected getClient(): SupabaseClient<any> {
    if (this.schema === 'public') return this.supabase;
    return this.supabase.schema(this.schema) as unknown as SupabaseClient<any>;
  }

  // ─── Caching ────────────────────────────────────────────────────────────────

  protected async cachedQuery<R>(
    key: string,
    queryFn: () => Promise<R>,
    ttl: number = 5 * 60 * 1000
  ): Promise<R> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data as R;
    }

    try {
      const result = await queryFn();
      this.cache.set(key, { data: result, timestamp: Date.now(), ttl });
      return result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  protected invalidateCache(): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(this.tableName)) {
        this.cache.delete(key);
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  // ─── Query builder ──────────────────────────────────────────────────────────

  protected buildQuery(options: QueryOptions = {}) {
    let query = this.getClient()
      .from(this.tableName)
      .select(options.select ?? "*");

    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        if (value === undefined || value === null) continue;
        query = Array.isArray(value)
          ? query.in(key, value)
          : query.eq(key, value);
      }
    }

    if (options.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? true,
      });
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset != null) {
      query = query.range(
        options.offset,
        options.offset + (options.limit ?? 10) - 1
      );
    }

    return query;
  }

  // ─── Read operations ────────────────────────────────────────────────────────

  async findMany(options: QueryOptions = {}): Promise<T[]> {
    const cacheKey =
      options.cacheKey ?? `${this.tableName}_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildQuery(options);
        if (error) throw error;
        return data as T[];
      },
      options.cacheTTL
    );
  }

  async findById(
    id: string,
    options: Omit<QueryOptions, "filters"> = {}
  ): Promise<T | null> {
    const cacheKey = `${this.tableName}_${id}_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildQuery({
          ...options,
          filters: { id },
        }).single();

        if (error) {
          if (error.code === "PGRST116") return null;
          throw error;
        }
        return data as T;
      },
      options.cacheTTL
    );
  }

  async findOne(
    filters: Record<string, unknown>,
    options: Omit<QueryOptions, "filters"> = {}
  ): Promise<T | null> {
    const cacheKey = `${this.tableName}_one_${JSON.stringify(filters)}_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildQuery({
          ...options,
          filters,
        }).single();

        if (error) {
          if (error.code === "PGRST116") return null;
          throw error;
        }
        return data as T;
      },
      options.cacheTTL
    );
  }

  async findPaginated(
    options: QueryOptions & PaginationOptions
  ): Promise<PaginatedResult<T>> {
    const { page, limit, ...queryOptions } = options;
    const offset = (page - 1) * limit;

    const { count, error: countError } = await this.supabase
      .from(this.tableName)
      .select("*", { count: "exact", head: true });

    if (countError) throw this.handleError(countError);

    const data = await this.findMany({ ...queryOptions, limit, offset });
    const totalPages = Math.ceil((count ?? 0) / limit);

    return {
      data,
      count: count ?? 0,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  // ─── Write operations ───────────────────────────────────────────────────────

  async create(data: Partial<T>): Promise<T> {
    try {
      const { data: result, error } = await this.getClient()
        .from(this.tableName)
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      this.invalidateCache();
      return result as T;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    try {
      const { data: result, error } = await this.getClient()
        .from(this.tableName)
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      this.invalidateCache();
      return result as T;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateMany(
    filters: Record<string, unknown>,
    data: Partial<T>
  ): Promise<T[]> {
    try {
      let query = this.getClient().from(this.tableName).update(data);

      for (const [key, value] of Object.entries(filters)) {
        query = Array.isArray(value)
          ? query.in(key, value)
          : query.eq(key, value);
      }

      const { data: result, error } = await query.select();
      if (error) throw error;
      this.invalidateCache();
      return result as T[];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const { error } = await this.getClient()
        .from(this.tableName)
        .delete()
        .eq("id", id);

      if (error) throw error;
      this.invalidateCache();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // ─── Optimistic updates ─────────────────────────────────────────────────────

  /**
   * U is a separate generic so it doesn't shadow the class-level T.
   * The caller can specify the return type explicitly when it differs from T.
   */
  async optimisticUpdate<U = T>(
    id: string,
    updateData: Partial<T>,
    optimisticFn: () => void,
    rollback: () => void
  ): Promise<U> {
    optimisticFn();
    try {
      const result = await this.update(id, updateData);
      return result as unknown as U;
    } catch (error) {
      rollback();
      throw error;
    }
  }

  // ─── Realtime subscriptions ─────────────────────────────────────────────────

  subscribe(
    channelName: string,
    filters: Record<string, unknown>,
    callback: (payload: unknown) => void
  ): RealtimeChannel {
    const channel = this.supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: this.schema,
          table: this.tableName,
          filter: this.buildFilterString(filters),
        },
        callback
      )
      .subscribe();

    this.subscriptions.set(channelName, channel);
    return channel;
  }

  unsubscribe(channelName: string): void {
    const channel = this.subscriptions.get(channelName);
    if (channel) {
      this.supabase.removeChannel(channel);
      this.subscriptions.delete(channelName);
    }
  }

  unsubscribeAll(): void {
    this.subscriptions.forEach((channel) => {
      this.supabase.removeChannel(channel);
    });
    this.subscriptions.clear();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildFilterString(filters: Record<string, unknown>): string {
    const entries = Object.entries(filters);
    if (entries.length === 0) return "";

    return entries
      .map(([key, value]) =>
        Array.isArray(value)
          ? `${key}=in.(${(value as unknown[]).join(",")})`
          : `${key}=eq.${value}`
      )
      .join("&");
  }

  protected handleError(error: unknown): RepositoryError {
    console.error(`Repository error in ${this.tableName}:`, error);

    let message = "An unexpected error occurred";
    let code = "UNKNOWN_ERROR";

    if (error && typeof error === "object") {
      const e = error as { code?: string; message?: string };
      code = e.code ?? "UNKNOWN_ERROR";

      switch (code) {
        case "PGRST116":
          message = "Record not found";
          break;
        case "23505":
          message = "Duplicate record";
          break;
        case "23503":
          message = "Foreign key constraint violation";
          break;
        case "23514":
          message = "Check constraint violation";
          break;
        case "42501":
          message = "Insufficient permissions";
          break;
        default:
          message = e.message ?? message;
      }
    }

    // Don't surface a toast for "not found" — that's usually handled by callers.
    if (code !== "PGRST116") {
      toast.error(message);
    }

    return new RepositoryError(message, code, error);
  }
}