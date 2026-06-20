import type { Alert } from "@/lib/supabase/types/alerts";
import type { Device } from "@/lib/supabase/types/devices";
import type { SyncQueueEntry } from "@/lib/supabase/types/sync";
import type {
  TelemetryEvent,
  FeatureVector,
  AnomalyScore,
} from "@/lib/supabase/types/telemetry";
import type { UserRole, AccountStatus } from "@/lib/supabase/types/shared";
import type { AuditLogEntry } from "@/lib/supabase/types/logs";

export interface UserRow {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  role: UserRole;
  account_status: AccountStatus;
  job_title: string | null;
  joined_at: string;
  updated_at: string;
}

export interface DeviceHealthRow {
  id: string;
  device_id: string;
  status: "ONLINE" | "OFFLINE" | "WARNING" | "ERROR";
  cpu_usage: number | null;
  memory_usage: number | null;
  disk_usage: number | null;
  network_status: boolean;
  alerts_last_24h: number;
  uptime_percentage: number | null;
  response_time_ms: number | null;
  error_count: number;
  warning_count: number;
  last_restart: string | null;
  organization_id: string;
  created_at: string;
  integrity_hash: string | null;
}

export interface EnrollmentTokenRow {
  id: string;
  token_hash: string;
  name: string | null;
  created_by: string;
  expires_at: string;
  max_uses: number;
  current_uses: number;
  is_used: boolean;
  used_at: string | null;
  used_by_device: string | null;
  organization_id: string;
  created_at: string;
}

export interface DeviceConfigRow {
  id: string;
  device_id: string | null;
  key: string;
  value: string;
  updated_by: string | null;
  organization_id: string;
  updated_at: string;
  version: number;
}

export interface RetentionSetting {
  id: string;
  organization_id: string;
  device_id: string | null;
  retention_days: number;
  data_types: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrivacySettingsRow {
  id: string;
  device_id: string | null;
  enhanced_mode: boolean;
  settings: Record<string, unknown>;
  data_minimization: boolean;
  updated_by: string | null;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

export interface DeviceAssignmentRow {
  id: string;
  user_id: string;
  device_id: string;
  assigned_at: string;
  assigned_by: string | null;
  is_active: boolean;
  organization_id: string;
}

export interface ApiKeyRow {
  id: string;
  device_id: string;
  key_hash: string;
  key_name: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  created_by: string | null;
  organization_id: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  organization_id: string;
  title: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  read: boolean;
  alert_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ModelRow {
  id: string;
  organization_id: string;
  model_id: string;
  name: string;
  version: string;
  threshold: number;
  detector_type: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  logo_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BillingRow {
  id: string;
  organization_id: string;
  stripe_customer_id: string | null;
  plan_tier: string;
  billing_email: string | null;
  billing_cycle: string | null;
  currency: string;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: Pick<UserRow, "id" | "full_name"> & Partial<Pick<UserRow, "username" | "avatar_url">>;
        Update: Partial<Omit<UserRow, "id">>;
      };
      devices: {
        Row: Device;
        Insert: Omit<
          Device,
          "id" | "enrolled_at" | "created_at" | "updated_at"
        >;
        Update: Partial<Omit<Device, "id" | "enrolled_at" | "created_at">>;
      };
      alerts: {
        Row: Alert;
        Insert: Omit<Alert, "id" | "created_at" | "updated_at" | "read">;
        Update: Partial<Alert>;
      };
      retention_settings: {
        Row: RetentionSetting;
        Insert: Omit<RetentionSetting, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<RetentionSetting, "id" | "created_at">>;
      };
      privacy_settings: {
        Row: PrivacySettingsRow;
        Insert: Omit<PrivacySettingsRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<PrivacySettingsRow, "id">>;
      };
      device_assignments: {
        Row: DeviceAssignmentRow;
        Insert: Omit<DeviceAssignmentRow, "id" | "assigned_at">;
        Update: Partial<Omit<DeviceAssignmentRow, "id">>;
      };
      notifications: {
        Row: NotificationRow;
        Insert: Omit<NotificationRow, "id" | "created_at">;
        Update: Partial<Omit<NotificationRow, "id">>;
      };
    };
  };
  devices: {
    Tables: {
      api_keys: {
        Row: ApiKeyRow;
        Insert: Omit<ApiKeyRow, "id" | "created_at">;
        Update: Partial<Omit<ApiKeyRow, "id">>;
      };
      enrollment_tokens: {
        Row: EnrollmentTokenRow;
        Insert: Pick<
          EnrollmentTokenRow,
          | "token_hash"
          | "name"
          | "created_by"
          | "expires_at"
          | "max_uses"
          | "organization_id"
        >;
        Update: Partial<EnrollmentTokenRow>;
      };
      config: {
        Row: DeviceConfigRow;
        Insert: Omit<DeviceConfigRow, "id" | "updated_at" | "version">;
        Update: Partial<Omit<DeviceConfigRow, "id">>;
      };
    };
  };
  telemetry: {
    Tables: {
      events: {
        Row: TelemetryEvent;
        Insert: Omit<TelemetryEvent, "id" | "received_at" | "created_at">;
        Update: never;
      };
      feature_vectors: {
        Row: FeatureVector;
        Insert: Omit<FeatureVector, "id" | "computed_at">;
        Update: never;
      };
      anomaly_scores: {
        Row: AnomalyScore;
        Insert: Omit<AnomalyScore, "id" | "scored_at" | "created_at">;
        Update: never;
      };
      device_health: {
        Row: DeviceHealthRow;
        Insert: Omit<DeviceHealthRow, "id" | "created_at">;
        Update: never;
      };
    };
  };
  internal: {
    Tables: {
      sync_queue: {
        Row: SyncQueueEntry;
        Insert: Omit<SyncQueueEntry, "id" | "created_at" | "updated_at">;
        Update: Partial<SyncQueueEntry>;
      };
      audit_logs: {
        Row: AuditLogEntry;
        Insert: Omit<AuditLogEntry, "id" | "timestamp">;
        Update: never;
      };
      models: {
        Row: ModelRow;
        Insert: Omit<ModelRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<ModelRow, "id">>;
      };
    };
  };
  organization: {
    Tables: {
      organizations: {
        Row: OrganizationRow;
        Insert: Omit<OrganizationRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<OrganizationRow, "id" | "created_at">>;
      };
      billing: {
        Row: BillingRow;
        Insert: Omit<BillingRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<BillingRow, "id" | "created_at">>;
      };
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, "id" | "joined_at" | "updated_at">;
        Update: Partial<Omit<ProfileRow, "id">>;
      };
    };
  };
}
