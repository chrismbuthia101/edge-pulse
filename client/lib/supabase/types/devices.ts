import { DeviceStatus } from '@/lib/supabase/types/shared';

export interface Device {
  id: string;
  name: string;
  type: 'server' | 'laptop' | 'workstation' | 'other';
  status: DeviceStatus;
  risk: 'critical' | 'high' | 'medium' | 'low' | 'none';
  alerts_count: number;
  os: string;
  last_seen: string;
  ip: string;
  agent_version: string;
  cpu_percent: number;
  ram_percent: number;
  sync_queue_depth: number;       // unsynced events
  hash_chain_ok: boolean;
  actively_reporting: boolean;    // sent telemetry in last 5 minutes
}
