import { AnomalyRepository } from "@/lib/repositories/anomaly-repository";
import type { AnomalyScore, AnomalyAnalytics } from "@/lib/types/anomaly";
import type { Result } from "@/lib/types/shared";

export class AnomalyService {
  constructor(private readonly repository: AnomalyRepository) {}

  public async getLatestAnomalyScore(deviceId: string): Promise<Result<AnomalyScore>> {
    const { data, error } = await this.repository.getLatestAnomalyScore(deviceId);
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "No anomaly score found" };
    return { success: true, data };
  }

  public async getDeviceAnomalyHistory(
    deviceId: string,
    limit: number = 20,
    search?: string,
  ): Promise<Result<AnomalyScore[]>> {
    const { data, error } = await this.repository.getAnomalyScores({
      deviceId,
      limit,
      search,
      orderBy: { column: "created_at", ascending: false },
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getAnomalyAnalytics(
    deviceId: string,
    timeframe?: "24h" | "7d" | "30d",
  ): Promise<Result<AnomalyAnalytics>> {
    const { data, error } = await this.repository.getAnomalyAnalytics(deviceId, timeframe);
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "No anomaly analytics available" };
    return { success: true, data };
  }
}
