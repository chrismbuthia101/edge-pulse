export {
  BaseRepository,
  RepositoryError,
} from "@/lib/repositories/base-repository";
export type {
  QueryOptions,
  PaginationOptions,
  PaginatedResult,
} from "@/lib/repositories/base-repository";

// Query utilities
export {
  buildCacheKey,
  parseSearchQuery,
  validateFilter,
  optimizeQuery,
  buildFilterString,
} from "@/lib/repositories/query-utils";
export type {
  SortOption,
  FilterOption,
  QueryBuilder,
} from "@/lib/repositories/query-utils";

// Domain repositories
export { AlertRepository } from "@/lib/repositories/alert-repository";
export { AnomalyRepository } from "@/lib/repositories/anomaly-repository";
export type {
  AnomalyAnalytics,
  AnomalyTrend,
  GetAnomalyScoresOptions,
} from "@/lib/repositories/anomaly-repository";

export { AuthRepository } from "@/lib/repositories/auth-repository";
export type {
  AuthUser,
  AuthResponse,
} from "@/lib/repositories/auth-repository";

export { DeviceAssignmentRepository } from "@/lib/repositories/device-assignment-repository";
export type {
  DeviceAssignment,
  DeviceAssignmentCreate,
  DeviceAssignmentQueryOptions,
  DeviceAssignmentSubscriptionCallbacks,
} from "@/lib/repositories/device-assignment-repository";

export { DeviceDataRepository } from "@/lib/repositories/device-data-repository";
export type {
  PurgeOptions,
  PurgeResult,
} from "@/lib/repositories/device-data-repository";
export type {
  AlertQueryOptions,
  AlertMetrics,
  AlertSubscriptionCallbacks,
} from "@/lib/repositories/alert-repository";

export { LiveRepository } from "@/lib/repositories/live-repository";
export type {
  LiveQueryOptions,
  LiveSubscriptionCallbacks,
  LiveStats,
} from "@/lib/repositories/live-repository";

export { SyncQueueRepository } from "@/lib/repositories/sync-queue-repository";
export type {
  SyncQueueItem,
  SyncQueueQueryOptions,
  SyncQueueSubscriptionCallbacks,
} from "@/lib/repositories/sync-queue-repository";
export type { DeviceSyncQueueSummary } from "@/lib/supabase/types";

export { DeviceRepository } from "@/lib/repositories/device-repository";
export type {
  DeviceQueryOptions,
  DeviceMetrics,
  DeviceSubscriptionCallbacks,
  DeviceHealthStatus,
} from "@/lib/repositories/device-repository";

export { HealthRepository } from "@/lib/repositories/health-repository";

export { LogsRepository } from "@/lib/repositories/logs-repository";
export type { AuditLogQueryOptions } from "@/lib/repositories/logs-repository";

export { AuditLogRepository } from "@/lib/repositories/audit-log-repository";
export type { AuditLogCreateInput } from "@/lib/repositories/audit-log-repository";

export { ReportRepository } from "@/lib/repositories/report-repository";
export type {
  ReportMetrics,
  ReportQueryOptions,
} from "@/lib/repositories/report-repository";

export { UserRepository } from "@/lib/repositories/user-repository";
export type {
  AnalystUser,
  UserQueryOptions,
  UserSubscriptionCallbacks,
} from "@/lib/repositories/user-repository";

export { DeviceEnrollmentRepository } from "@/lib/repositories/device-enrollment-repository";
export type {
  DeviceEnrollmentQueryOptions,
  CreateTokenOptions,
  CreateTokenResult,
} from "@/lib/repositories/device-enrollment-repository";

export { PrivacyRepository } from "@/lib/repositories/privacy-repository";

export { ForensicRepository } from "@/lib/repositories/forensic-repository";
export type { ExportQuery } from "@/lib/repositories/forensic-repository";

export { RetentionRepository } from "@/lib/repositories/retention-repository";
export type { StorageUsage } from "@/lib/repositories/retention-repository";

export { ResilienceRepository } from "@/lib/repositories/resilience-repository";
export type {
  ConnectionMetrics,
  ResilienceMetrics,
  OfflineEfficiencyMetrics,
  ResilienceQueryOptions,
} from "@/lib/repositories/resilience-repository";

export { NotificationRepository } from "@/lib/repositories/notification-repository";
export type {
  NotificationQueryOptions,
  NotificationSubscriptionCallbacks,
} from "@/lib/repositories/notification-repository";

export { OrganizationRepository } from "@/lib/repositories/organization-repository";
export { StorageRepository } from "@/lib/repositories/storage-repository";

export { ThresholdRepository } from "@/lib/repositories/threshold-repository";
export type { ModelThreshold } from "@/lib/repositories/threshold-repository";
