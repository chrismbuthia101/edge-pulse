import { ResilienceRepository } from '@/lib/repositories/resilience-repository';
import type {
  ConnectionMetrics,
  ResilienceMetrics,
  OfflineEfficiencyMetrics,
  ResilienceQueryOptions,
} from '@/lib/repositories/resilience-repository';

export class ResilienceService {
  constructor(private readonly repository: ResilienceRepository) { }

  async getConnectionMetrics(options: ResilienceQueryOptions = {}): Promise<ConnectionMetrics[]> {
    return this.repository.getConnectionMetrics(options);
  }

  async getResilienceMetrics(): Promise<ResilienceMetrics> {
    return this.repository.getResilienceMetrics();
  }

  async getOfflineEfficiencyMetrics(timeRange: '24h' | '7d' = '24h'): Promise<OfflineEfficiencyMetrics[]> {
    return this.repository.getOfflineEfficiencyMetrics(timeRange);
  }

  async getDeviceConnectionHistory(deviceId: string, timeRange: '24h' | '7d' = '24h'): Promise<Array<{
    device_id: string;
    status: string;
    uptime_percentage: number;
    response_time_ms: number;
    created_at: string;
  }>> {
    return this.repository.getDeviceConnectionHistory(deviceId, timeRange);
  }

  async getAggregatedEfficiencyMetrics(timeRange: '24h' | '7d' = '24h'): Promise<{
    totalOfflineDuration: number;
    averageSyncSuccessRate: number;
    averageLatency: number;
    totalItemsQueued: number;
    dataIntegrityRate: number;
    devicesWithOfflinePeriods: number;
  }> {
    const metrics = await this.getOfflineEfficiencyMetrics(timeRange);

    const totalOfflineDuration = metrics.reduce((sum, m) => sum + m.offline_duration_minutes, 0);
    const averageSyncSuccessRate = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.sync_success_rate, 0) / metrics.length
      : 100;
    const averageLatency = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.average_sync_latency_ms, 0) / metrics.length
      : 0;
    const totalItemsQueued = metrics.reduce((sum, m) => sum + m.items_queued_during_offline, 0);
    const dataIntegrityRate = metrics.length > 0
      ? (metrics.filter(m => m.data_integrity_verified).length / metrics.length) * 100
      : 100;
    const devicesWithOfflinePeriods = metrics.filter(m => m.offline_duration_minutes > 0).length;

    return {
      totalOfflineDuration: Math.round(totalOfflineDuration),
      averageSyncSuccessRate: Math.round(averageSyncSuccessRate * 10) / 10,
      averageLatency: Math.round(averageLatency),
      totalItemsQueued,
      dataIntegrityRate: Math.round(dataIntegrityRate * 10) / 10,
      devicesWithOfflinePeriods,
    };
  }

  async getPerformanceTrends(timeRange: '24h' | '7d' = '24h'): Promise<{
    uptimeTrend: Array<{ timestamp: string; value: number }>;
    latencyTrend: Array<{ timestamp: string; value: number }>;
    queueDepthTrend: Array<{ timestamp: string; value: number }>;
  }> {
    const efficiencyMetrics = await this.getOfflineEfficiencyMetrics(timeRange);

    const now = new Date();
    const startTime = timeRange === '24h'
      ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
      : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const uptimeTrend = efficiencyMetrics.map(m => ({
      timestamp: m.last_offline_period?.start || startTime.toISOString(),
      value: m.sync_success_rate,
    }));

    const latencyTrend = efficiencyMetrics.map(m => ({
      timestamp: m.last_offline_period?.start || startTime.toISOString(),
      value: m.average_sync_latency_ms,
    }));

    const queueDepthTrend = efficiencyMetrics.map(m => ({
      timestamp: m.last_offline_period?.start || startTime.toISOString(),
      value: m.items_queued_during_offline,
    }));

    return {
      uptimeTrend,
      latencyTrend,
      queueDepthTrend,
    };
  }
}
