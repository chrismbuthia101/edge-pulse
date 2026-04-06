import { BaseRepository } from "@/lib/repositories/base-repository";
import type { PrivacySettings, PrivacySettingsUpdate } from "@/lib/supabase/types/privacy-settings";

export class PrivacyRepository extends BaseRepository<PrivacySettings> {
  constructor() {
    super("privacy_settings");
  }

  async findByDeviceId(deviceId: string | null): Promise<PrivacySettings | null> {
    return this.findOne({ device_id: deviceId });
  }

  async upsertByDeviceId(
    deviceId: string | null,
    data: PrivacySettingsUpdate
  ): Promise<PrivacySettings> {
    try {
      const { data: result, error } = await this.supabase
        .from(this.tableName)
        .upsert({
          device_id: deviceId,
          ...data,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      this.invalidateCache();
      return result as PrivacySettings;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getOrCreateGlobalSettings(): Promise<PrivacySettings> {
    // Try to get global settings first
    let settings = await this.findByDeviceId(null);
    
    if (!settings) {
      // Create default global settings if they don't exist
      settings = await this.create({
        device_id: null,
        enhanced_mode: false,
        anonymize_ips: true,
        encrypt_pii: true,
        mask_usernames: false,
        redact_sensitive_data: false,
      });
    }
    
    return settings;
  }
}
