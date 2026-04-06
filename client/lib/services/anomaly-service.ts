import {
  AnomalyRepository,
  type AnomalyScore,
  type GetAnomalyScoresOptions,
  type AnomalyAnalytics,
  type AnomalyTrend
} from '@/lib/repositories/anomaly-repository';

export type { AnomalyScore, AnomalyAnalytics, AnomalyTrend } from '@/lib/repositories/anomaly-repository';

export class AnomalyService {
  constructor(private readonly repository: AnomalyRepository) { }

  async getAnomalyScores(options: GetAnomalyScoresOptions): Promise<AnomalyScore[]> {
    return this.repository.getAnomalyScores(options);
  }

  async getLatestAnomalyScore(deviceId: string): Promise<AnomalyScore | null> {
    return this.repository.getLatestAnomalyScore(deviceId);
  }

  async getDeviceAnomalyHistory(deviceId: string, limit: number = 20, search?: string): Promise<AnomalyScore[]> {
    return this.repository.getAnomalyScores({
      deviceId,
      limit,
      search,
      orderBy: { column: 'created_at', ascending: false }
    });
  }

  async getAnomalyAnalytics(deviceId: string, timeframe?: '24h' | '7d' | '30d'): Promise<AnomalyAnalytics | null> {
    return this.repository.getAnomalyAnalytics(deviceId, timeframe);
  }

  async getAnomalyTrend(deviceId: string, hours: number = 24): Promise<AnomalyTrend | null> {
    return this.repository.getAnomalyTrend(deviceId, hours);
  }

  async getAnomalyScoresInTimeframe(
    deviceId: string,
    startTime: string,
    endTime: string
  ): Promise<AnomalyScore[]> {
    return this.repository.getAnomalyScoresInTimeframe(deviceId, startTime, endTime);
  }

  async getAnomalyScoresWithPagination(
    options: GetAnomalyScoresOptions & { page: number; limit: number }
  ) {
    return this.repository.getAnomalyScoresWithPagination(options);
  }

  async getAnomalyScoresForMultipleDevices(
    deviceIds: string[],
    options: Omit<GetAnomalyScoresOptions, 'deviceId'> = {}
  ): Promise<Record<string, AnomalyScore[]>> {
    return this.repository.getAnomalyScoresForMultipleDevices(deviceIds, options);
  }

  async cleanupOldAnomalyScores(olderThanDays: number = 90): Promise<number> {
    return this.repository.cleanupOldAnomalyScores(olderThanDays);
  }
}

export { AnomalyRepository };
export const anomalyRepository = new AnomalyRepository();
