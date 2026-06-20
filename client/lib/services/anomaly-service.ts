import {
  AnomalyRepository,
  type AnomalyAnalytics,
} from "@/lib/repositories/anomaly-repository";
import type { AnomalyScore } from "@/lib/supabase/types";

export type { AnomalyAnalytics } from "@/lib/repositories/anomaly-repository";
export type { AnomalyScore } from "@/lib/supabase/types";

export class AnomalyService {
  constructor(private readonly repository: AnomalyRepository) {}

  async getLatestAnomalyScore(deviceId: string): Promise<AnomalyScore | null> {
    return this.repository.getLatestAnomalyScore(deviceId);
  }

  async getDeviceAnomalyHistory(
    deviceId: string,
    limit: number = 20,
    search?: string,
  ): Promise<AnomalyScore[]> {
    return this.repository.getAnomalyScores({
      deviceId,
      limit,
      search,
      orderBy: { column: "created_at", ascending: false },
    });
  }

  async getAnomalyAnalytics(
    deviceId: string,
    timeframe?: "24h" | "7d" | "30d",
  ): Promise<AnomalyAnalytics | null> {
    return this.repository.getAnomalyAnalytics(deviceId, timeframe);
  }
}

export { AnomalyRepository };
export const anomalyRepository = new AnomalyRepository();
