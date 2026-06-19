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
  actively_reporting: boolean;
  enrolled_by: string | null;
  enrolled_at: string;
  last_seen: string;
  is_active: boolean;
  deactivated_at: string | null;
  deactivated_reason: string | null;
  deactivated_by: string | null;
  tags: string[];
  organization_id: string;
  created_at: string;
  updated_at: string;
}