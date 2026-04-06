import type { DeviceStatus, DeviceRisk, DeviceType } from '@/lib/supabase/types/shared';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  os: string;
  ip: string | null;
  agent_version: string;
  status: DeviceStatus;
  risk: DeviceRisk;
  alerts_count: number;
  cpu_percent: number;
  ram_percent: number;
  sync_queue_depth: number;
  hash_chain_ok: boolean;
  actively_reporting: boolean;
  enrolled_by: string | null;
  enrolled_at: string;
  last_seen: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}