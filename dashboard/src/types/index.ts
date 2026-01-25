export interface Alert {
  alert_id: string
  timestamp: string
  device_id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  anomaly_score: number
  anomaly_type: string
  explanation: {
    summary: string
    contributing_factors: Array<{
      feature: string
      contribution: number
      direction: string
    }>
  }
}

export interface Device {
  device_id: string
  device_name: string
  last_seen: string
  status: 'online' | 'offline'
  alert_count: number
}

export interface SystemHealth {
  timestamp: string
  cpu_percent: number
  memory_percent: number
  disk_usage: number
  network_bytes_sent: number
  network_bytes_recv: number
}
