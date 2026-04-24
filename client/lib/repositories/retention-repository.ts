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
    try {
      // Calculate actual storage usage from database tables
      const [telemetryResult, alertsResult, featuresResult] = await Promise.all([
        this.supabase
          .from('telemetry_events')
          .select('data')
          .eq('device_id', deviceId),
        this.supabase
          .from('alerts')
          .select('*')
          .eq('device_id', deviceId),
        this.supabase
          .from('anomaly_features')
          .select('*')
          .eq('device_id', deviceId)
      ]);

      // Estimate storage in MB (rough estimate based on row count)
      const telemetrySize = (telemetryResult.data?.length || 0) * 0.001; // ~1KB per telemetry event
      const alertsSize = (alertsResult.data?.length || 0) * 0.0005; // ~0.5KB per alert
      const featuresSize = (featuresResult.data?.length || 0) * 0.002; // ~2KB per feature record
      const total = telemetrySize + alertsSize + featuresSize;

      return {
        telemetry: parseFloat(telemetrySize.toFixed(2)),
        alerts: parseFloat(alertsSize.toFixed(2)),
        features: parseFloat(featuresSize.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
      };
    } catch (error) {
      console.error('Failed to calculate storage usage:', error);
      return {
        telemetry: 0,
        alerts: 0,
        features: 0,
        total: 0,
      };
    }
  }
}
