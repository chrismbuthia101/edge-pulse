export interface PrivacySettings {
    id: string;
    device_id: string | null;
    enhanced_mode: boolean;
    settings: Record<string, boolean>;
    data_minimization: boolean;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface PrivacySettingsUpdate {
    enhanced_mode?: boolean;
    settings?: Record<string, boolean>;
    data_minimization?: boolean;
}
