import type { SyncQueueStatus } from "@/lib/supabase/types/shared";

export interface SyncQueueEntry {
  id: string;
  device_id: string;
  event_id: string | null;
  status: SyncQueueStatus;
  item_type: string | null;
  item_id: string | null;
  data_json: Record<string, unknown>;
  priority: number;
  attempts: number;
  last_attempt: string | null;
  next_retry: string | null;
  last_error: string | null;
  organization_id: string;
  synced_at: string | null;
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
