import type { Alert } from '@/lib/supabase/types/alerts';
import type { SyncQueueEntry } from '@/lib/supabase/types/sync';
import type { TelemetryEvent, FeatureVector, AnomalyScore } from '@/lib/supabase/types/telemetry';
import type { UserRole, CaseSeverity, CaseStatus, DeviceStatus, DeviceRisk, DeviceType } from '@/lib/supabase/types/shared';

export interface TamperEvidentLog {
  log_id: string;
  device_id: string;
  log_sequence_number: number;
  log_entry_type: string;
  log_entry_reference_id: string | null;
  entry_timestamp_utc: string;
  entry_content_hash: string;
  previous_entry_hash: string;
  digital_signature: string | null;
  created_at: string;
}

export interface DeviceRegistry {
  device_id: string;
  hostname: string;
  operating_system: string;
  agent_version: string;
  device_type: DeviceType;
  ip_address: string | null;
  enrolled_at: string;
  enrolled_by: string | null;
  last_seen_utc: string;
  is_active: boolean;
  status: DeviceStatus;
  risk_level: DeviceRisk;
  alerts_count: number;
  cpu_percent: number | null;
  ram_percent: number | null;
  sync_queue_depth: number;
  hash_chain_ok: boolean;
  actively_reporting: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeviceHealthSnapshot {
  snapshot_id: string;
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
  created_at: string;
}

export interface AnalystUser {
  user_id: string;
  full_name: string;
  role: UserRole;
  department: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  email?: string;
}

export interface IncidentCase {
  case_id: string;
  case_number: string;
  title: string;
  description: string | null;
  severity: CaseSeverity;
  status: CaseStatus;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface CaseNote {
  note_id: string;
  case_id: string;
  content: string;
  created_by: string;
  created_at: string;
}

export interface EnrollmentToken {
  token_id: string;
  token_hash: string;
  created_by: string;
  expires_at: string;
  max_uses: number;
  current_uses: number;
  is_used: boolean;
  used_at: string | null;
  used_by_device_id: string | null;
  created_at: string;
}

export interface AgentConfig {
  config_id: string;
  device_id: string | null;
  key: string;
  value: string;
  updated_by: string | null;
  updated_at: string;
  version: number;
}

export interface Database {
  public: {
    Tables: {
      analyst_users: {
        Row: AnalystUser;
        Insert: Omit<AnalystUser, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<AnalystUser, 'user_id'>>;
      };
      device_registry: {
        Row: DeviceRegistry;
        Insert: Omit<DeviceRegistry, 'device_id' | 'enrolled_at' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DeviceRegistry, 'device_id' | 'enrolled_at' | 'created_at' | 'updated_at'>>;
      };
      alert_records: {
        Row: Alert;
        Insert: Omit<Alert, 'id' | 'created_at' | 'updated_at' | 'read'>;
        Update: Partial<Alert>;
      };
      telemetry_events: {
        Row: TelemetryEvent;
        Insert: Omit<TelemetryEvent, 'id' | 'received_at'>;
        Update: never;  // telemetry is immutable
      };
      feature_vectors: {
        Row: FeatureVector;
        Insert: Omit<FeatureVector, 'id' | 'computed_at'>;
        Update: never;
      };
      anomaly_scores: {
        Row: AnomalyScore;
        Insert: Omit<AnomalyScore, 'id' | 'scored_at'>;
        Update: never;
      };
      tamper_evident_log: {
        Row: TamperEvidentLog;
        Insert: Omit<TamperEvidentLog, 'log_id' | 'created_at'>;
        Update: Partial<TamperEvidentLog>;
      };
      device_enrollment_tokens: {
        Row: EnrollmentToken;
        Insert: Pick<EnrollmentToken, 'token_hash' | 'created_by' | 'expires_at' | 'max_uses'>;
        Update: Pick<EnrollmentToken, 'current_uses' | 'is_used' | 'used_at' | 'used_by_device_id'>;
      };
      incident_cases: {
        Row: IncidentCase;
        Insert: Omit<IncidentCase, 'case_id' | 'case_number' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<IncidentCase, 'case_id' | 'case_number' | 'created_at'>>;
      };
      case_notes: {
        Row: CaseNote;
        Insert: Omit<CaseNote, 'note_id' | 'created_at'>;
        Update: never;
      };
      sync_queue: {
        Row: SyncQueueEntry;
        Insert: Omit<SyncQueueEntry, 'id' | 'queued_at'>;
        Update: Partial<SyncQueueEntry>;
      };
      device_health_snapshots: {
        Row: DeviceHealthSnapshot;
        Insert: Omit<DeviceHealthSnapshot, 'snapshot_id' | 'created_at'>;
        Update: Partial<DeviceHealthSnapshot>;
      };
      agent_config: {
        Row: AgentConfig;
        Insert: Omit<AgentConfig, 'config_id' | 'updated_at'>;
        Update: Partial<Omit<AgentConfig, 'config_id' | 'updated_at'>>;
      };
    };
  };
}