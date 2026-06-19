import type { Alert } from '@/lib/supabase/types/alerts';
import type { Device } from '@/lib/supabase/types/devices';

export interface RealtimeAlertPayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Alert;
  old: Partial<Alert>;
}

export interface RealtimeDevicePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Device;
  old: Partial<Device>;
}

export interface RealtimeNotificationPayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: { id: string; user_id: string; title: string; message: string; read: boolean; created_at: string };
  old: Partial<{ read: boolean }>;
}
