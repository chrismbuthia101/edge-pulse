// Shared primitives
export type {
  AlertStatus,
  AlertSeverity,
  TelemetrySource,
  DeviceStatus,
  DeviceRisk,
  DeviceType,
  SyncQueueStatus,
  ConnectivityState,
  UserRole,
  PrivilegeLevel,
  AccountStatus,
} from "@/lib/supabase/types/shared";

export type {
  TelemetryEvent,
  FeatureVector,
  AnomalyScore,
  FeatureType,
} from "@/lib/supabase/types/telemetry";

export type {
  Alert,
  ShapExplanation,
  ShapFeature,
} from "@/lib/supabase/types/alerts";

export type { Device } from "@/lib/supabase/types/devices";

export type {
  SyncQueueEntry,
  DeviceSyncQueueSummary,
} from "@/lib/supabase/types/sync";

export type {
  RealtimeAlertPayload,
  RealtimeDevicePayload,
  RealtimeNotificationPayload,
} from "@/lib/supabase/types/realtime";

export type {
  Database,
  UserRow,
  ProfileRow,
  DeviceHealthRow,
  EnrollmentTokenRow,
  DeviceConfigRow,
  DeviceAssignmentRow,
  ApiKeyRow,
  NotificationRow,
  OrganizationRow,
  BillingRow,
  RetentionSetting,
  PrivacySettingsRow,
  ModelRow,
} from "@/lib/supabase/types/database";

export type {
  DeviceHealthSnapshot,
  SystemHealth,
} from "@/lib/supabase/types/health";

export type { AuditLogEntry } from "@/lib/supabase/types/logs";

export type {
  PrivacySettings,
  PrivacySettingsUpdate,
} from "@/lib/supabase/types/privacy-settings";
