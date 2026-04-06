export interface PrivacySettings {
    id: string;
    device_id: string | null;
    enhanced_mode: boolean;
    anonymize_ips: boolean;
    encrypt_pii: boolean;
    mask_usernames: boolean;
    redact_sensitive_data: boolean;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface PrivacySettingsUpdate {
    enhanced_mode?: boolean;
    anonymize_ips?: boolean;
    encrypt_pii?: boolean;
    mask_usernames?: boolean;
    redact_sensitive_data?: boolean;
}

export interface PrivacyLevel {
    level: "Standard" | "Enhanced";
    description: string;
    settings: PrivacySettingsUpdate;
}
