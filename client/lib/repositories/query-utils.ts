/**
 Shared utilities for query building, caching, formatting, and async control
**/

export interface SortOption {
  field: string;
  direction: "asc" | "desc";
}

export interface FilterOption {
  field: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "like" | "ilike";
  value: string | number | boolean | string[] | number[];
}

export interface QueryBuilder {
  select?: string;
  filters?: FilterOption[];
  sorts?: SortOption[];
  limit?: number;
  offset?: number;
  cacheKey?: string;
  cacheTTL?: number;
}

export interface PaginationResult {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startIndex: number;
  endIndex: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
}

// ─── Query building ───────────────────────────────────────────────────────────

export function buildCacheKey(tableName: string, query: QueryBuilder): string {
  const parts = [tableName];

  if (query.select) parts.push(`select:${query.select}`);

  if (query.filters?.length) {
    const filterStr = query.filters
      .map((f) => `${f.field}:${f.operator}:${JSON.stringify(f.value)}`)
      .join(",");
    parts.push(`filters:${filterStr}`);
  }

  if (query.sorts?.length) {
    const sortStr = query.sorts
      .map((s) => `${s.field}:${s.direction}`)
      .join(",");
    parts.push(`sorts:${sortStr}`);
  }

  if (query.limit != null) parts.push(`limit:${query.limit}`);
  if (query.offset != null) parts.push(`offset:${query.offset}`);

  return parts.join("|");
}

export function escapeWildcards(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

export function parseSearchQuery(
  search: string,
  searchableFields: string[],
): FilterOption[] {
  const trimmed = search.trim();
  if (!trimmed || searchableFields.length === 0) return [];

  const escaped = escapeWildcards(trimmed);

  return searchableFields.map((field) => ({
    field,
    operator: "ilike" as const,
    value: `%${escaped}%`,
  }));
}

export function buildFilterString(filters: FilterOption[]): string {
  return filters
    .filter(validateFilter)
    .map(({ field, operator, value }) => {
      switch (operator) {
        case "eq":
          return `${field}=eq.${value}`;
        case "ne":
          return `${field}=neq.${value}`;
        case "gt":
          return `${field}=gt.${value}`;
        case "gte":
          return `${field}=gte.${value}`;
        case "lt":
          return `${field}=lt.${value}`;
        case "lte":
          return `${field}=lte.${value}`;
        case "like":
          return `${field}=like.${value}`;
        case "ilike":
          return `${field}=ilike.${value}`;
        case "in":
          return `${field}=in.(${Array.isArray(value) ? value.join(",") : value})`;
      }
    })
    .join("&");
}

/** Returns true when the filter has all required fields and a usable value. */
export function validateFilter(filter: FilterOption): boolean {
  if (!filter.field || !filter.operator) return false;

  switch (filter.operator) {
    case "eq":
    case "ne":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "like":
    case "ilike":
      return (
        filter.value !== undefined &&
        filter.value !== null &&
        filter.value !== ""
      );
    case "in":
      return Array.isArray(filter.value) && filter.value.length > 0;
    default:
      return false;
  }
}

export function optimizeQuery(query: QueryBuilder): QueryBuilder {
  const optimized = { ...query };

  if (optimized.filters) {
    const seen = new Set<string>();
    optimized.filters = optimized.filters.filter((filter) => {
      if (!validateFilter(filter)) return false;
      // Include the serialised value in the key so different range bounds survive.
      const key = `${filter.field}:${filter.operator}:${JSON.stringify(filter.value)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (optimized.sorts) {
    const seen = new Set<string>();
    optimized.sorts = optimized.sorts.filter((sort) => {
      if (seen.has(sort.field)) return false;
      seen.add(sort.field);
      return true;
    });
  }

  return optimized;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export function calculatePagination(
  total: number,
  page: number,
  limit: number,
): PaginationResult {
  const totalPages = Math.ceil(total / limit);

  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    startIndex: (page - 1) * limit,
    endIndex: Math.min(page * limit, total),
  };
}

// ─── Caching ──────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class QueryOptimizer {
  private cache = new Map<string, CacheEntry<unknown>>();
  private hits = 0;
  private misses = 0;

  constructor(
    private defaultTTL: number = 5 * 60 * 1000,
    /** When set, the oldest entry is evicted once the cache exceeds this size. */
    private maxSize?: number,
  ) {}

  async execute<T>(
    key: string,
    queryFn: () => Promise<T>,
    options: { ttl?: number; forceRefresh?: boolean } = {},
  ): Promise<T> {
    const ttl = options.ttl ?? this.defaultTTL;
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;

    if (
      !options.forceRefresh &&
      cached &&
      Date.now() - cached.timestamp < cached.ttl
    ) {
      this.hits++;
      return cached.data;
    }

    this.misses++;
    const result = await queryFn();

    // Evict the oldest entry when over capacity (Map preserves insertion order)
    if (this.maxSize && this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }

    this.cache.set(key, { data: result, timestamp: Date.now(), ttl });
    return result;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? NaN : this.hits / total,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}

// ─── Async control flow ───────────────────────────────────────────────────────

export interface DebouncedFn<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): void;
  /** Cancels any pending invocation. */
  cancel(): void;
}

/**
 * Returns a debounced version of `func` that delays invocation until `wait`ms
 * after the last call. Exposes a `cancel()` method to abort a pending call.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
): DebouncedFn<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = undefined;
      func(...args);
    }, wait);
  };

  debounced.cancel = () => {
    clearTimeout(timeout);
    timeout = undefined;
  };

  return debounced as DebouncedFn<T>;
}

export interface ThrottledFn<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): void;
  /** Cancels any pending trailing call. */
  cancel(): void;
}

/**
 * Returns a throttled version of `func` that invokes at most once per `limit`ms.
 * The first call fires immediately; a trailing call is scheduled so the last
 * invocation during a burst is never silently dropped.
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number,
): ThrottledFn<T> {
  let lastCall = 0;
  let trailingTimeout: ReturnType<typeof setTimeout> | undefined;

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = limit - (now - lastCall);

    clearTimeout(trailingTimeout);

    if (remaining <= 0) {
      lastCall = now;
      func(...args);
    } else {
      // Schedule a trailing call so the last burst invocation is not lost.
      trailingTimeout = setTimeout(() => {
        lastCall = Date.now();
        trailingTimeout = undefined;
        func(...args);
      }, remaining);
    }
  };

  throttled.cancel = () => {
    clearTimeout(trailingTimeout);
    trailingTimeout = undefined;
  };

  return throttled as ThrottledFn<T>;
}

/**
 * Memoizes a synchronous function with an optional max-size LRU eviction and
 * custom key generator.
 *
 * Without `maxSize`, the cache grows unboundedly — only use that for functions
 * with a small, finite input domain.
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
  func: T,
  options: {
    keyGenerator?: (...args: Parameters<T>) => string;
    maxSize?: number;
  } = {},
): T {
  const cache = new Map<string, ReturnType<T>>();
  const { keyGenerator, maxSize } = options;

  return ((...args: Parameters<T>) => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);

    if (cache.has(key)) return cache.get(key)!;

    const result = func(...args) as ReturnType<T>;

    if (maxSize && cache.size >= maxSize) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }

    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Retries an async function with exponential back-off.
 *
 * @param func         The async function to attempt.
 * @param maxAttempts  Total number of attempts (default 3).
 * @param baseDelay    Initial delay in ms; doubles each retry (default 1000).
 * @param shouldRetry  Optional predicate — return false to abort early on
 *                     non-retryable errors (e.g. 4xx HTTP responses).
 */
export async function retry<T>(
  func: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 1000,
  shouldRetry?: (error: unknown, attempt: number) => boolean,
): Promise<T> {
  let lastError: unknown = new Error("retry: no attempts were made");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await func();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) break;
      if (shouldRetry && !shouldRetry(error, attempt)) break;

      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Processes an array in sequential batches, awaiting each batch before
 * starting the next. Useful for rate-limited API calls.
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize = 5,
  delayBetweenBatches = 100,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    if (i + batchSize < items.length) {
      await sleep(delayBetweenBatches);
    }
  }

  return results;
}

/** Resolves after `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const BYTE_UNITS = [
  "Bytes",
  "KB",
  "MB",
  "GB",
  "TB",
  "PB",
  "EB",
  "ZB",
  "YB",
] as const;

export function formatBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 Bytes";
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    BYTE_UNITS.length - 1,
  );
  const dm = Math.max(0, decimals);

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${BYTE_UNITS[i]}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

/**
 * Returns `value` as a percentage of `total`, clamped to [0, 100].
 * Returns 0 when total is 0 rather than NaN.
 * Rounding is left to the caller — returns a float by default.
 */
export function safePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return clamp((value / total) * 100, 0, 100);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ─── Colour utilities ─────────────────────────────────────────────────────────

type ColourType = "bg" | "text" | "border";

/**
 * Returns a Tailwind colour class from a lookup map, with a grey fallback.
 * Extracted to eliminate the identical logic in `getStatusColorClass` and
 * `getSeverityColorClass`.
 */
function lookupColorClass(
  key: string,
  map: Record<string, Record<ColourType, string>>,
  type: ColourType,
): string {
  return (
    map[key]?.[type] ??
    (type === "bg"
      ? "bg-gray-500"
      : type === "border"
        ? "border-gray-500"
        : "text-gray-500")
  );
}

/** Produces a three-way colour map entry (bg / text / border) for a Tailwind colour. */
function colourEntry(colour: string): Record<ColourType, string> {
  return {
    bg: `bg-${colour}`,
    text: `text-${colour}`,
    border: `border-${colour}`,
  };
}

const STATUS_COLOURS: Record<string, Record<ColourType, string>> = {
  online: colourEntry("green-500"),
  offline: colourEntry("red-500"),
  isolated: colourEntry("orange-500"),
  gone_silent: colourEntry("amber-500"),
  unsynced: colourEntry("blue-500"),
  PENDING: colourEntry("red-500"),
  ACKNOWLEDGED: colourEntry("orange-500"),
  INVESTIGATED: colourEntry("blue-500"),
  CLOSED: colourEntry("green-500"),
};

const SEVERITY_COLOURS: Record<string, Record<ColourType, string>> = {
  critical: colourEntry("red-500"),
  high: colourEntry("orange-500"),
  medium: colourEntry("amber-500"),
  low: colourEntry("blue-500"),
  none: colourEntry("green-500"),
};

export function getStatusColorClass(
  status: string,
  type: ColourType = "text",
): string {
  return lookupColorClass(status, STATUS_COLOURS, type);
}

export function getSeverityColorClass(
  severity: string,
  type: ColourType = "text",
): string {
  return lookupColorClass(severity, SEVERITY_COLOURS, type);
}

/**
 * Returns an `rgb(...)` colour on a green → yellow → red gradient.
 * Useful for continuous value indicators (CPU %, anomaly scores, etc.).
 *
 * @param value  The value to map.
 * @param min    Lower bound of the expected range (default 0).
 * @param max    Upper bound of the expected range (default 100).
 */
export function getColorForValue(value: number, min = 0, max = 100): string {
  const normalized = clamp((value - min) / (max - min), 0, 1);

  if (normalized < 0.5) {
    const t = normalized * 2;
    return `rgb(${Math.round(255 * t)}, 255, 0)`;
  } else {
    const t = (normalized - 0.5) * 2;
    return `rgb(255, ${Math.round(255 * (1 - t))}, 0)`;
  }
}
