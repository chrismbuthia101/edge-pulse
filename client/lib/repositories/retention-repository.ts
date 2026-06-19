import { BaseRepository } from "@/lib/repositories/base-repository";
import type { RetentionSetting } from "@/lib/supabase/types/database";

export interface StorageUsage {
  telemetry: number;
  alerts: number;
  features: number;
  health: number;
  total: number;
}

export class RetentionRepository extends BaseRepository<RetentionSetting> {
  constructor() {
    super("retention_settings");
  }

  async getRetentionSettings(
    deviceId: string | null,
    organizationId?: string,
  ): Promise<RetentionSetting | null> {
    const query = deviceId ? { device_id: deviceId } : { device_id: null };

    const options: Record<string, unknown> = { ...query };
    if (organizationId) options.organization_id = organizationId;

    const result = await this.findOne(options);
    return result as RetentionSetting | null;
  }

  async upsertRetentionSetting(
    deviceId: string | null,
    retentionDays: number,
    organizationId: string,
  ): Promise<void> {
    try {
      const { error } = await this.getClient().from(this.tableName).upsert({
        device_id: deviceId,
        retention_days: retentionDays,
        organization_id: organizationId,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async purgeOldTelemetryData(
    deviceId: string | null,
    cutoffDate: string,
    organizationId?: string,
  ): Promise<void> {
    try {
      const query = this.supabase
        .schema("telemetry")
        .from("events")
        .delete()
        .lt("collected_at", cutoffDate);

      if (deviceId) query.eq("device_id", deviceId);
      if (organizationId) query.eq("organization_id", organizationId);

      const { error } = await query;
      if (error) throw error;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async calculateStorageUsage(
    deviceId: string | null,
    organizationId?: string,
  ): Promise<StorageUsage> {
    try {
      const baseFilter = (q: any) => {
        let query = q;
        if (deviceId) query = query.eq("device_id", deviceId);
        if (organizationId) query = query.eq("organization_id", organizationId);
        return query;
      };

      const [telemetryResult, alertsResult, featuresResult, healthResult] =
        await Promise.all([
          baseFilter(
            this.supabase.schema("telemetry").from("events").select("id"),
          ),
          baseFilter(this.getClient().from("alerts").select("id")),
          baseFilter(
            this.supabase
              .schema("telemetry")
              .from("feature_vectors")
              .select("id"),
          ),
          baseFilter(
            this.supabase
              .schema("telemetry")
              .from("device_health")
              .select("id"),
          ),
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
      console.error("Failed to calculate storage usage:", error);
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
