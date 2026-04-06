import type { SyncQueueStatus } from '@/lib/supabase/types/shared';

export interface TamperEvidentLog {
  id: string;
  device_id: string;
  sequence_number: number;
  event_type: string;
  payload: Record<string, unknown>;
  entry_hash: string;
  prev_hash: string;
  created_at: string;
  verified: boolean | null;
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
  telemetry_event_id: string;
  status: SyncQueueStatus;
  queued_at: string;
  synced_at: string | null;
  retry_count: number;
  last_error: string | null;
}

export interface DeviceSyncQueueSummary {
  device_id: string;
  device_name: string;
  pending_count: number;
  failed_count: number;
  oldest_queued_at: string | null;
}