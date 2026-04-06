export interface DeviceHealth {
  device_id: string;
  hostname: string;
  operating_system: string;
  agent_version: string;
  last_seen_utc: string;
  is_active: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'WARNING' | 'ERROR';
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  network_status: boolean;
  alerts_last_24h: number;
  uptime_percentage: number;
  response_time_ms: number;
  error_count: number;
  warning_count: number;
  last_restart: string | null;
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
  system_status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  last_updated: string;
}