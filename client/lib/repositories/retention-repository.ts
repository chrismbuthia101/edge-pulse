import {
  BaseRepository,
} from '@/lib/repositories/base-repository';

export interface RetentionSetting {
  device_id: string;
  retention_days: number;
  updated_at: string;
}

export interface StorageUsage {
  telemetry: number;
  alerts: number;
  features: number;
  total: number;
}

export class RetentionRepository extends BaseRepository {
  constructor() {
    super('retention_settings');
  }

  async getRetentionSettings(deviceId: string): Promise<RetentionSetting | null> {
    const result = await this.findOne({ device_id: deviceId || 'global' });
    return result as RetentionSetting | null;
  }

  async upsertRetentionSetting(deviceId: string, retentionDays: number): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('retention_settings')
        .upsert({
          device_id: deviceId || 'global',
          retention_days: retentionDays,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async purgeOldTelemetryData(deviceId: string, cutoffDate: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('telemetry_events')
        .delete()
        .lt('collected_at', cutoffDate)
        .eq('device_id', deviceId);

      if (error) throw error;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async calculateStorageUsage(deviceId: string): Promise<StorageUsage> {
    // This is a mock implementation - in a real scenario, you would
    // calculate actual storage usage from the database
    const baseSize = 26.9;
    const retentionDays = await this.getRetentionSettings(deviceId)
      .then(settings => settings?.retention_days || 90);

    const multiplier = retentionDays / 90;

    return {
      telemetry: parseFloat((15.7 * multiplier).toFixed(1)),
      alerts: parseFloat((2.3 * multiplier).toFixed(1)),
      features: parseFloat((8.9 * multiplier).toFixed(1)),
      total: parseFloat((baseSize * multiplier).toFixed(1)),
    };
  }
}
