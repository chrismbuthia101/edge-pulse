export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  device_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  ip_address: string | null;
  user_agent: string | null;
  organization_id: string | null;
  timestamp: string;
}
