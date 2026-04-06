import { PrivacyRepository } from "@/lib/repositories/privacy-repository";
import type { PrivacySettings, PrivacySettingsUpdate } from "@/lib/supabase/types/privacy-settings";

export interface PrivacyServiceOptions {
  deviceId?: string;
}

export class PrivacyService {
  constructor(private repository: PrivacyRepository) { }

  async getPrivacySettings(options?: PrivacyServiceOptions): Promise<PrivacySettings> {
    const deviceId = options?.deviceId || null;

    // Try device-specific settings first, fall back to global
    let settings = await this.repository.findByDeviceId(deviceId);

    if (!settings) {
      settings = await this.repository.getOrCreateGlobalSettings();
    }

    return settings;
  }

  async updatePrivacySettings(
    updates: PrivacySettingsUpdate,
    options?: PrivacyServiceOptions
  ): Promise<PrivacySettings> {
    const deviceId = options?.deviceId || null;
    return this.repository.upsertByDeviceId(deviceId, updates);
  }

  async toggleEnhancedMode(options?: PrivacyServiceOptions): Promise<PrivacySettings> {
    const current = await this.getPrivacySettings(options);
    const newMode = !current.enhanced_mode;

    // Apply preset settings based on mode
    const updates: PrivacySettingsUpdate = {
      enhanced_mode: newMode,
      anonymize_ips: true,
      encrypt_pii: true,
      mask_usernames: newMode,
      redact_sensitive_data: newMode,
    };

    return this.updatePrivacySettings(updates, options);
  }

  async subscribeToPrivacySettings(
    deviceId: string | null,
    callbacks: {
      onUpdate?: (settings: PrivacySettings) => void;
      onError?: (error: unknown) => void;
    }
  ) {
    const channelName = `privacy_settings_${deviceId || 'global'}`;

    return this.repository.subscribe(
      channelName,
      { device_id: deviceId },
      (payload: unknown) => {
        const typedPayload = payload as {
          eventType: string;
          new: PrivacySettings;
          old: PrivacySettings;
        };

        if (typedPayload.eventType === 'UPDATE' || typedPayload.eventType === 'INSERT') {
          callbacks.onUpdate?.(typedPayload.new);
        }
      }
    );
  }

  unsubscribeFromPrivacySettings(deviceId: string | null) {
    const channelName = `privacy_settings_${deviceId || 'global'}`;
    this.repository.unsubscribe(channelName);
  }
}
