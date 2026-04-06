import type { SyncQueueStatus } from '@/lib/supabase/types/shared';

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
  verified: boolean;
  created_at: string;
}

export interface HashChainStatus {
  device_id: string;
  device_name: string;
  total_entries: number;
  verified: boolean;
  broken_at_sequence: number | null;
  last_verified_at: string | null;
}

export interface SyncQueueEntry {
  id: string;
  device_id: string;
  telemetry_event_id: string | null;
  status: SyncQueueStatus;
  queued_at: string;
  synced_at: string | null;
  retry_count: number;
  last_error: string | null;
  item_type: string | null;
  item_id: string | null;
  data_json: Record<string, unknown>;
  attempts: number;
  last_attempt: string | null;
  next_retry: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface DeviceSyncQueueSummary {
  device_id: string;
  device_name: string;
  pending_count: number;
  failed_count: number;
  oldest_queued_at: string | null;
}