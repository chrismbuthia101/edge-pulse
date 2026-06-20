import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export interface QueryOptions {
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  filters?: Record<string, FilterValue>;
  cacheKey?: string;
  cacheTTL?: number;
  suppressToast?: boolean;
}

export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "in";

export type FilterValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | Partial<
      Record<FilterOperator, string | number | boolean | string[] | number[]>
    >;

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
    public details?: unknown,
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

const DEFAULT_CACHE_MAX_SIZE = 500;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

const OPERATOR_TO_POSTGREST_METHOD: Partial<Record<FilterOperator, string>> = {
  eq: "eq",
  ne: "neq",
  gt: "gt",
  gte: "gte",
  lt: "lt",
  lte: "lte",
  like: "like",
  ilike: "ilike",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) =>
      `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`,
  );
  return `{${pairs.join(",")}}`;
}

function formatRealtimeFilterClause(
  key: string,
  op: string,
  value: unknown,
): string {
  if (op === "in") {
    const values = Array.isArray(value) ? value : [value];
    return `${key}=in.(${values.join(",")})`;
  }
  return `${key}=${op}.${value}`;
}

class QueryCache {
  private store = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly maxSize: number = DEFAULT_CACHE_MAX_SIZE) {}

  async get<R>(
    key: string,
    queryFn: () => Promise<R>,
    ttl: number,
  ): Promise<R> {
    const cached = this.store.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data as R;
    }

    const pending = this.inflight.get(key) as Promise<R> | undefined;
    if (pending) return pending;

    const promise = queryFn()
      .then((result) => {
        this.write(key, result, ttl);
        return result;
      })
      .finally(() => this.inflight.delete(key));

    this.inflight.set(key, promise);
    return promise;
  }

  invalidate(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }

  private write(key: string, data: unknown, ttl: number): void {
    this.evictIfFull();
    this.store.set(key, { data, timestamp: Date.now(), ttl });
  }

  private evictIfFull(): void {
    while (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }
}

class SubscriptionManager {
  private channels = new Map<string, RealtimeChannel>();

  constructor(private readonly client: AnySupabaseClient) {}

  add(name: string, channel: RealtimeChannel): void {
    this.remove(name);
    this.channels.set(name, channel);
  }

  remove(name: string): void {
    const channel = this.channels.get(name);
    if (!channel) return;
    this.client.removeChannel(channel);
    this.channels.delete(name);
  }

  removeAll(): void {
    this.channels.forEach((channel) => this.client.removeChannel(channel));
    this.channels.clear();
  }
}

export abstract class BaseRepository<T = Record<string, unknown>> {
  protected supabase: AnySupabaseClient = createClient();
  protected schema: string = "public";

  private readonly cache = new QueryCache();
  private readonly subscriptions: SubscriptionManager;

  constructor(protected tableName: string) {
    this.subscriptions = new SubscriptionManager(this.supabase);
  }

  protected getClient(): AnySupabaseClient {
    if (this.schema === "public") return this.supabase;
    return this.supabase.schema(this.schema) as unknown as AnySupabaseClient;
  }

  private buildCacheKey(defaultSuffix: string, customKey?: string): string {
    return `${this.tableName}::${customKey ?? defaultSuffix}`;
  }

  protected async cachedQuery<R>(
    key: string,
    queryFn: () => Promise<R>,
    options: { ttl?: number; suppressToast?: boolean } = {},
  ): Promise<R> {
    const queryFnWithErrorHandling = async (): Promise<R> => {
      try {
        return await queryFn();
      } catch (error) {
        throw this.handleError(error, { suppressToast: options.suppressToast });
      }
    };

    return this.cache.get(
      key,
      queryFnWithErrorHandling,
      options.ttl ?? DEFAULT_CACHE_TTL_MS,
    );
  }

  protected invalidateCache(): void {
    this.cache.invalidate(`${this.tableName}::`);
  }

  clearCache(): void {
    this.cache.clear();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected applyFilter(query: any, key: string, value: unknown): any {
    if (value === undefined || value === null) return query;

    if (isPlainObject(value)) {
      for (const [op, opVal] of Object.entries(value)) {
        query = this.applyOperator(query, key, op as FilterOperator, opVal);
      }
      return query;
    }

    return Array.isArray(value) ? query.in(key, value) : query.eq(key, value);
  }

  private applyOperator(
    query: any,
    key: string,
    op: FilterOperator,
    opVal: unknown,
  ): any {
    if (opVal === undefined || opVal === null) return query;
    if (op === "in")
      return query.in(key, Array.isArray(opVal) ? opVal : [opVal]);

    const method = OPERATOR_TO_POSTGREST_METHOD[op];
    return method ? query[method](key, opVal) : query;
  }

  protected buildQuery(options: QueryOptions = {}) {
    let query = this.getClient()
      .from(this.tableName)
      .select(options.select ?? "*");

    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        query = this.applyFilter(query, key, value);
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
        options.offset + (options.limit ?? 10) - 1,
      );
    }

    return query;
  }

  async countWhere(filters?: Record<string, FilterValue>): Promise<number> {
    try {
      let query = this.getClient()
        .from(this.tableName)
        .select("*", { count: "exact", head: true });

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          query = this.applyFilter(query, key, value);
        }
      }

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    } catch (error) {
      throw this.handleError(error, { suppressToast: true });
    }
  }

  async findMany(options: QueryOptions = {}): Promise<T[]> {
    const cacheKey = this.buildCacheKey(
      stableStringify(options),
      options.cacheKey,
    );

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildQuery(options);
        if (error) throw error;
        return data as T[];
      },
      { ttl: options.cacheTTL, suppressToast: options.suppressToast },
    );
  }

  async findById(
    id: string,
    options: Omit<QueryOptions, "filters"> = {},
  ): Promise<T | null> {
    return this.findSingle(
      { id },
      options,
      `id_${id}_${stableStringify(options)}`,
    );
  }

  async findOne(
    filters: Record<string, FilterValue>,
    options: Omit<QueryOptions, "filters"> = {},
  ): Promise<T | null> {
    return this.findSingle(
      filters,
      options,
      `one_${stableStringify(filters)}_${stableStringify(options)}`,
    );
  }

  private async findSingle(
    filters: Record<string, FilterValue>,
    options: Omit<QueryOptions, "filters">,
    cacheKeySuffix: string,
  ): Promise<T | null> {
    const cacheKey = this.buildCacheKey(cacheKeySuffix, options.cacheKey);

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
      { ttl: options.cacheTTL, suppressToast: options.suppressToast },
    );
  }

  async findPaginated(
    options: QueryOptions & PaginationOptions,
  ): Promise<PaginatedResult<T>> {
    const { page, limit, ...queryOptions } = options;
    const offset = (page - 1) * limit;

    const [count, data] = await Promise.all([
      this.countWhere(queryOptions.filters),
      this.findMany({ ...queryOptions, limit, offset }),
    ]);

    const totalPages = Math.ceil(count / limit);

    return {
      data,
      count,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  async create(data: Partial<T>): Promise<T> {
    return this.runMutation<T>(() =>
      this.getClient().from(this.tableName).insert(data).select().single(),
    );
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    return this.runMutation<T>(() =>
      this.getClient()
        .from(this.tableName)
        .update(data)
        .eq("id", id)
        .select()
        .single(),
    );
  }

  async updateMany(
    filters: Record<string, FilterValue>,
    data: Partial<T>,
  ): Promise<T[]> {
    return this.runMutation<T[]>(() => {
      let query = this.getClient().from(this.tableName).update(data);
      for (const [key, value] of Object.entries(filters)) {
        query = this.applyFilter(query, key, value);
      }
      return query.select();
    });
  }

  async delete(id: string): Promise<void> {
    await this.runMutation<null>(() =>
      this.getClient().from(this.tableName).delete().eq("id", id),
    );
  }

  private async runMutation<R>(
    operation: () => PromiseLike<{ data: R | null; error: unknown }>,
  ): Promise<R> {
    try {
      const { data, error } = await operation();
      if (error) throw error;
      this.invalidateCache();
      return data as R;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  subscribe(
    channelName: string,
    filters: Record<string, FilterValue>,
    callback: (payload: unknown) => void,
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
        callback,
      )
      .subscribe();

    this.subscriptions.add(channelName, channel);
    return channel;
  }

  unsubscribe(channelName: string): void {
    this.subscriptions.remove(channelName);
  }

  unsubscribeAll(): void {
    this.subscriptions.removeAll();
  }

  private buildFilterString(filters: Record<string, FilterValue>): string {
    const clauses: string[] = [];

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue;

      if (isPlainObject(value)) {
        for (const [op, opVal] of Object.entries(value)) {
          if (opVal === undefined || opVal === null) continue;
          clauses.push(formatRealtimeFilterClause(key, op, opVal));
        }
        continue;
      }

      clauses.push(
        Array.isArray(value)
          ? formatRealtimeFilterClause(key, "in", value)
          : formatRealtimeFilterClause(key, "eq", value),
      );
    }

    return clauses.join("&");
  }

  protected handleError(
    error: unknown,
    options?: { suppressToast?: boolean },
  ): RepositoryError {
    console.error(`Repository error in ${this.tableName}:`, error);

    const { message, code } = this.describeError(error);

    const shouldToast = code !== "PGRST116" && !options?.suppressToast;
    if (shouldToast) {
      toast.error(message);
    }

    return new RepositoryError(message, code, error);
  }

  private describeError(error: unknown): { message: string; code: string } {
    if (!error || typeof error !== "object") {
      return { message: "An unexpected error occurred", code: "UNKNOWN_ERROR" };
    }

    const e = error as { code?: string; message?: string };
    const code = e.code ?? "UNKNOWN_ERROR";

    const KNOWN_ERROR_MESSAGES: Record<string, string> = {
      PGRST116: "Record not found",
      "23505": "Duplicate record",
      "23503": "Foreign key constraint violation",
      "23514": "Check constraint violation",
      "42501": "Insufficient permissions",
    };

    return {
      message:
        KNOWN_ERROR_MESSAGES[code] ??
        e.message ??
        "An unexpected error occurred",
      code,
    };
  }
}
