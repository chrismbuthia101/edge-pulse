import type { DeviceStatus, DeviceRisk, DeviceType } from './shared';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  risk: DeviceRisk;
  alerts_count: number;
  os: string;
  last_seen: string;
  ip: string | null;
  agent_version: string;
  cpu_percent: number;
  ram_percent: number;
  sync_queue_depth: number;
  hash_chain_ok: boolean;
  actively_reporting: boolean;
}