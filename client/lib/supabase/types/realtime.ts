import { Alert } from '@/lib/supabase/types/alerts';
import { Device } from '@/lib/supabase/types/devices';
import { Case } from '@/lib/supabase/types';

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

export interface RealtimeCasePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Case;
  old: Partial<Case>;
}
