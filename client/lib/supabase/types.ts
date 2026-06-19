// Shared primitives
export type {
  AlertStatus,
  AlertSeverity,
  TelemetrySource,
  DeviceStatus,
  SyncQueueStatus,
  ConnectivityState,
  UserRole,
  PrivilegeLevel,
  AccountStatus,
} from '@/lib/supabase/types/shared';

// Telemetry types
export type {
  TelemetryEvent,
  FeatureVector,
  AnomalyScore,
} from '@/lib/supabase/types/telemetry';

// Alert types
export type {
  Alert,
  ShapExplanation,
  ShapFeature,
} from '@/lib/supabase/types/alerts';

// Device types
export type {
  Device,
} from '@/lib/supabase/types/devices';

// Sync types
export type {
  SyncQueueEntry,
  DeviceSyncQueueSummary,
} from '@/lib/supabase/types/sync';

// Realtime types
export type {
  RealtimeAlertPayload,
  RealtimeDevicePayload,
  RealtimeNotificationPayload,
} from '@/lib/supabase/types/realtime';

// Database types
export type {
  Database,
  UserRow,
  DeviceHealthRow,
  EnrollmentTokenRow,
  DeviceConfigRow,
  DeviceAssignmentRow,
  ApiKeyRow,
  NotificationRow,
  OrganizationRow,
  BillingRow,
} from '@/lib/supabase/types/database';

// Health types
export type {
  DeviceHealthSnapshot,
  SystemHealth,
} from '@/lib/supabase/types/health';

// Audit log types
export type {
  AuditLogEntry,
} from '@/lib/supabase/types/logs';

// Privacy settings
export type {
  PrivacySettings,
  PrivacySettingsUpdate,
} from '@/lib/supabase/types/privacy-settings';