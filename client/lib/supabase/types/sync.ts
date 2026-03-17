import { SyncQueueStatus } from '@/lib/supabase/types/shared';

export interface TamperEvidentLog {
  id: string;
  device_id: string;
  sequence_number: number;        // monotonically increasing per device
  event_type: string;             // e.g. "ALERT_CREATED", "AGENT_START"
  payload: Record<string, unknown>;
  entry_hash: string;             // SHA-256 of (prev_hash + payload)
  prev_hash: string;              // hash of previous entry (genesis = "0000...")
  created_at: string;
  verified: boolean | null;       // null = not yet verified
}

// Verification result for a device's hash chain
export interface HashChainStatus {
  device_id: string;
  device_name: string;
  total_entries: number;
  verified: boolean;
  broken_at_sequence: number | null; // sequence number where chain breaks
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

// Aggregated per-device sync queue summary
export interface DeviceSyncQueueSummary {
  device_id: string;
  device_name: string;
  pending_count: number;
  failed_count: number;
  oldest_queued_at: string | null;
}
