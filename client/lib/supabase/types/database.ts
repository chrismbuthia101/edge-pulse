import { TelemetryEvent } from '@/lib/supabase/types/telemetry';
import { FeatureVector } from '@/lib/supabase/types/telemetry';
import { AnomalyScore } from '@/lib/supabase/types/telemetry';
import { Alert } from '@/lib/supabase/types/alerts';
import { TamperEvidentLog } from '@/lib/supabase/types/sync';
import { SyncQueueEntry } from '@/lib/supabase/types/sync';
import { Device } from '@/lib/supabase/types/devices';

export interface Database {
  public: {
    Tables: {
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
      alert_records: {
        Row: Alert;
        Insert: Omit<Alert, 'id' | 'created_at' | 'read'>;
        Update: Partial<Alert>;
      };
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
      devices: {
        Row: Device;
        Insert: Omit<Device, 'id' | 'last_seen' | 'alerts_count'>;
        Update: Partial<Device>;
      };
    };
  };
}
