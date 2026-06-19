export interface PrivacySettings {
  id: string;
  device_id: string | null;
  enhanced_mode: boolean;
  settings: Record<string, unknown>;
  data_minimization: boolean;
  updated_by: string | null;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

export interface PrivacySettingsUpdate {
  enhanced_mode?: boolean;
  settings?: Record<string, unknown>;
  data_minimization?: boolean;
}
