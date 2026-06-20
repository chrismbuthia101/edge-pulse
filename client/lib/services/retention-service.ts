import { RetentionRepository } from "@/lib/repositories";
import type { StorageUsage } from "@/lib/repositories/retention-repository";
import { toast } from "sonner";

export class RetentionService {
  constructor(private repository: RetentionRepository) {}

  async getRetentionSettings(
    deviceId: string | null,
    organizationId?: string,
  ): Promise<number> {
    try {
      const settings = await this.repository.getRetentionSettings(
        deviceId,
        organizationId,
      );
      return settings?.retention_days || 90;
    } catch (error) {
      console.error("Failed to fetch retention settings:", error);
      toast.error("Failed to load retention settings");
      return 90;
    }
  }

  async updateRetentionSettings(
    deviceId: string | null,
    retentionDays: number,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.repository.upsertRetentionSetting(
        deviceId,
        retentionDays,
        organizationId,
      );
      toast.success("Retention settings updated successfully");
    } catch (error) {
      console.error("Failed to update retention settings:", error);
      toast.error("Failed to update retention settings");
      throw error;
    }
  }

  async purgeOldData(
    deviceId: string | null,
    retentionDays: number,
    organizationId?: string,
  ): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      await this.repository.purgeOldTelemetryData(
        deviceId,
        cutoffDate.toISOString(),
        organizationId,
      );
      toast.success("Old telemetry data purged successfully");
    } catch (error) {
      console.error("Failed to purge old data:", error);
      toast.error("Failed to purge old telemetry data");
      throw error;
    }
  }

  async getStorageUsage(
    deviceId: string | null,
    organizationId?: string,
  ): Promise<StorageUsage> {
    try {
      return await this.repository.calculateStorageUsage(
        deviceId,
        organizationId,
      );
    } catch (error) {
      console.error("Failed to calculate storage usage:", error);
      return { telemetry: 0, alerts: 0, features: 0, health: 0, total: 0 };
    }
  }

  async refreshStorageUsage(deviceId: string | null): Promise<StorageUsage> {
    return this.getStorageUsage(deviceId);
  }
}
