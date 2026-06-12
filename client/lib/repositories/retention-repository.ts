import {
  BaseRepository,
} from '@/lib/repositories/base-repository';

export interface RetentionSetting {
  id: string;
  organization_id: string;
  device_id: string | null;
  retention_days: number;
  data_types: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StorageUsage {
  telemetry: number;
  alerts: number;
  features: number;
  health: number;
  total: number;
}

export class RetentionRepository extends BaseRepository {
  constructor() {
    super('retention_settings');
  }

  async getRetentionSettings(deviceId: string | null): Promise<RetentionSetting | null> {
    const query = deviceId
      ? { device_id: deviceId }
      : { device_id: null };
    const result = await this.findOne(query);
    return result as RetentionSetting | null;
  }

  async upsertRetentionSetting(deviceId: string | null, retentionDays: number): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('retention_settings')
        .upsert({
          device_id: deviceId,
          retention_days: retentionDays,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async purgeOldTelemetryData(deviceId: string | null, cutoffDate: string): Promise<void> {
    try {
      const query = this.supabase
        .from('events')
        .delete()
        .lt('collected_at', cutoffDate);

      if (deviceId) query.eq('device_id', deviceId);

      const { error } = await query;
      if (error) throw error;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async calculateStorageUsage(deviceId: string | null): Promise<StorageUsage> {
    try {
      const baseFilter = (q: any) => deviceId ? q.eq('device_id', deviceId) : q;

      const [telemetryResult, alertsResult, featuresResult, healthResult] = await Promise.all([
        baseFilter(this.supabase.from('events').select('id').eq('device_id', deviceId!)),
        baseFilter(this.supabase.from('alerts').select('id').eq('device_id', deviceId!)),
        baseFilter(this.supabase.from('feature_vectors').select('id').eq('device_id', deviceId!)),
        baseFilter(this.supabase.from('device_health').select('id').eq('device_id', deviceId!)),
      ]);

      const telemetrySize = (telemetryResult.data?.length || 0) * 0.001;
      const alertsSize = (alertsResult.data?.length || 0) * 0.0005;
      const featuresSize = (featuresResult.data?.length || 0) * 0.002;
      const healthSize = (healthResult.data?.length || 0) * 0.0005;
      const total = telemetrySize + alertsSize + featuresSize + healthSize;

      return {
        telemetry: parseFloat(telemetrySize.toFixed(2)),
        alerts: parseFloat(alertsSize.toFixed(2)),
        features: parseFloat(featuresSize.toFixed(2)),
        health: parseFloat(healthSize.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
      };
    } catch (error) {
      console.error('Failed to calculate storage usage:', error);
      return {
        telemetry: 0,
        alerts: 0,
        features: 0,
        health: 0,
        total: 0,
      };
    }
  }
}
