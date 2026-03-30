import type { TelemetryEvent, FeatureVector, AnomalyScore } from './telemetry';
import type { Alert } from './alerts';
import type { TamperEvidentLog, SyncQueueEntry } from './sync';
import type { Device } from './devices';

export interface Database {
  public: {
    Tables: {

      // ===============================
      // TELEMETRY
      // ===============================
      telemetry_events: {
        Row: TelemetryEvent;
        Insert: Omit<TelemetryEvent, 'id' | 'received_at'>;
        Update: Partial<TelemetryEvent>;
      };

      feature_vectors: {
        Row: FeatureVector;
        Insert: Omit<FeatureVector, 'id' | 'computed_at'>;
        Update: Partial<FeatureVector>;
      };

      anomaly_scores: {
        Row: AnomalyScore;
        Insert: Omit<AnomalyScore, 'id' | 'scored_at'>;
        Update: Partial<AnomalyScore>;
      };

      // ===============================
      // ALERTS
      // ===============================
      alert_records: {
        Row: Alert;
        Insert: Omit<Alert, 'id' | 'created_at' | 'read'>;
        Update: Partial<Alert>;
      };

      // ===============================
      // LOGGING / SYNC
      // ===============================
      tamper_evident_log: {
        Row: TamperEvidentLog;
        Insert: Omit<TamperEvidentLog, 'id' | 'created_at' | 'entry_hash'>;
        Update: Partial<TamperEvidentLog>;
      };

      sync_queue: {
        Row: SyncQueueEntry;
        Insert: Omit<SyncQueueEntry, 'id' | 'queued_at'>;
        Update: Partial<SyncQueueEntry>;
      };

      // ===============================
      // DEVICES
      // ===============================
      devices: {
        Row: Device;
        Insert: Omit<Device, 'id' | 'last_seen' | 'alerts_count'>;
        Update: Partial<Device>;
      };

      // ===============================
      // DEVICE ENROLLMENT TOKENS
      // ===============================
      device_enrollment_tokens: {
        Row: {
          token_id: string;
          token_hash: string;
          created_by: string;
          expires_at: string;
          is_used: boolean;
          used_at: string | null;
          used_by_device_id: string | null;
          max_uses: number;
          current_uses: number;
          created_at: string;
        };

        Insert: {
          token_hash: string;
          created_by: string;
          expires_at: string;
          max_uses: number;

          token_id?: string;
          current_uses?: number;
          is_used?: boolean;
          used_at?: string | null;
          used_by_device_id?: string | null;
          created_at?: string;
        };

        Update: Partial<{
          token_hash: string;
          created_by: string;
          expires_at: string;
          is_used: boolean;
          used_at: string | null;
          used_by_device_id: string | null;
          max_uses: number;
          current_uses: number;
          created_at: string;
        }>;
      };

    };
  };
}