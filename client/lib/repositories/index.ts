export { BaseRepository, RepositoryError } from '@/lib/repositories/base-repository';
export type { QueryOptions, PaginationOptions, PaginatedResult } from '@/lib/repositories/base-repository';

// Query utilities
export {
  buildCacheKey,
  parseSearchQuery,
  validateFilter,
  optimizeQuery,
  buildFilterString,
  calculatePagination,
  debounce,
  throttle,
  memoize,
  formatBytes,
  formatDuration,
  safePercentage,
  clamp,
  getColorForValue,
  getStatusColorClass,
  getSeverityColorClass,
  retry,
  batchProcess,
  QueryOptimizer
} from '@/lib/repositories/query-utils';
export type { SortOption, FilterOption, QueryBuilder } from './query-utils';

// Domain repositories
export { AlertRepository } from '@/lib/repositories/alert-repository';
export type {
  AlertQueryOptions,
  AlertMetrics,
  AlertSubscriptionCallbacks
} from '@/lib/repositories/alert-repository';

export { DeviceRepository } from '@/lib/repositories/device-repository';
export type {
  DeviceQueryOptions,
  DeviceMetrics,
  DeviceSubscriptionCallbacks,
  DeviceHealthStatus
} from '@/lib/repositories/device-repository';
