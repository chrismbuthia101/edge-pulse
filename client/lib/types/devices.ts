import type {
  DeviceStatus,
  DeviceRisk,
  DeviceType,
} from "@/lib/types/shared";

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

export interface DeviceQueryOptions {
  search?: string;
  status?: DeviceStatus | DeviceStatus[];
  type?: DeviceType | DeviceType[];
  risk?: DeviceRisk | DeviceRisk[];
  onlineOnly?: boolean;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  select?: string;
}

export interface DeviceMetrics {
  total: number;
  online: number;
  offline: number;
  isolated: number;
  gone_silent: number;
  unsynced: number;
  byType: Record<string, number>;
  byRisk: Record<string, number>;
  avgCpuUsage: number;
  avgRamUsage: number;
  totalAlerts: number;
  criticalDevices: number;
  highRiskDevices: number;
  outdatedAgents: number;
  totalSyncQueueDepth: number;
}

export type DeviceHealthStatus = "healthy" | "warning" | "critical";

export interface DeviceHealthInfo {
  deviceId: string;
  deviceName: string;
  status: DeviceHealthStatus;
  issues: string[];
  lastSeen: string;
  syncQueueDepth: number;
  agentVersion: string;
  recommendations: string[];
}

export interface DeviceSubscriptionCallbacks {
  onInsert?: (device: Device) => void;
  onUpdate?: (device: Device) => void;
  onDelete?: (device: Device) => void;
  onError?: (error: unknown) => void;
}

export interface DeviceAssignment {
  id: string;
  user_id: string;
  device_id: string;
  assigned_at: string;
  assigned_by: string | null;
  is_active: boolean;
  organization_id: string;
  device_name?: string;
  device_type?: string;
  device_status?: string;
  device_ip?: string;
  user_name?: string;
}

export interface DeviceAssignmentCreate {
  user_id: string;
  device_id: string;
  assigned_by: string;
}

export interface DeviceAssignmentSubscriptionCallbacks {
  onInsert?: (assignment: DeviceAssignment) => void;
  onUpdate?: (assignment: DeviceAssignment) => void;
  onDelete?: (assignment: DeviceAssignment) => void;
  onError?: (error: unknown) => void;
}
