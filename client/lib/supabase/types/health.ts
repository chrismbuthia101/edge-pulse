export interface DeviceHealthSnapshot {
  id: string;
  device_id: string;
  status: "ONLINE" | "OFFLINE" | "WARNING" | "ERROR";
  cpu_usage: number | null;
  memory_usage: number | null;
  disk_usage: number | null;
  network_status: boolean;
  alerts_last_24h: number;
  uptime_percentage: number | null;
  response_time_ms: number | null;
  error_count: number;
  warning_count: number;
  last_restart: string | null;
  organization_id: string;
  created_at: string;
  integrity_hash: string | null;
}

export interface SystemHealth {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  warning_devices: number;
  error_devices: number;
  avg_cpu_usage: number;
  avg_memory_usage: number;
  avg_disk_usage: number;
  total_alerts: number;
  total_alerts_24h: number;
  critical_alerts_24h: number;
  system_uptime: number;
  api_response_time: number;
  system_status: "HEALTHY" | "WARNING" | "CRITICAL";
  last_updated: string;
}
