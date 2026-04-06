import { createClient } from '@/lib/supabase/client';

export interface TelemetrySample {
  collected_at: string;
  cpu_percent: number;
  ram_percent: number;
}

export interface GetTelemetryOptions {
  deviceId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  orderBy?: 'collected_at' | 'cpu_percent' | 'ram_percent';
  orderDirection?: 'asc' | 'desc';
}

interface TelemetryData {
  collected_at: string;
  cpu_percent: number | null;
  ram_percent: number | null;
}

export class TelemetryService {
  private supabase = createClient();

  async getTelemetry(options: GetTelemetryOptions = {}): Promise<TelemetrySample[]> {
    let query = this.supabase
      .from('telemetry_events')
      .select('collected_at, cpu_percent, ram_percent');

    // Apply filters
    if (options.deviceId) {
      query = query.eq('device_id', options.deviceId);
    }

    if (options.startDate) {
      query = query.gte('collected_at', options.startDate);
    }

    if (options.endDate) {
      query = query.lte('collected_at', options.endDate);
    }

    // Ordering
    const orderBy = options.orderBy || 'collected_at';
    const orderDirection = options.orderDirection || 'desc';
    query = query.order(orderBy, { ascending: orderDirection === 'asc' });

    // Limit
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((t: TelemetryData) => ({
      collected_at: t.collected_at,
      cpu_percent: t.cpu_percent ?? 0,
      ram_percent: t.ram_percent ?? 0,
    }));
  }

  async getLatestTelemetry(deviceId: string, limit = 48): Promise<TelemetrySample[]> {
    return this.getTelemetry({
      deviceId,
      limit,
      orderBy: 'collected_at',
      orderDirection: 'desc',
    });
  }

  async getTelemetryByTimeRange(
    deviceId: string,
    startDate: string,
    endDate: string
  ): Promise<TelemetrySample[]> {
    return this.getTelemetry({
      deviceId,
      startDate,
      endDate,
      orderBy: 'collected_at',
      orderDirection: 'asc',
    });
  }

  async getAverageCpuUsage(deviceId: string, hours = 24): Promise<number> {
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const telemetry = await this.getTelemetry({
      deviceId,
      startDate,
      orderBy: 'collected_at',
      orderDirection: 'desc',
      limit: 100,
    });

    if (telemetry.length === 0) return 0;

    const totalCpu = telemetry.reduce((sum, t) => sum + t.cpu_percent, 0);
    return Math.round(totalCpu / telemetry.length);
  }

  async getAverageRamUsage(deviceId: string, hours = 24): Promise<number> {
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const telemetry = await this.getTelemetry({
      deviceId,
      startDate,
      orderBy: 'collected_at',
      orderDirection: 'desc',
      limit: 100,
    });

    if (telemetry.length === 0) return 0;

    const totalRam = telemetry.reduce((sum, t) => sum + t.ram_percent, 0);
    return Math.round(totalRam / telemetry.length);
  }

  async getTelemetryMetrics(deviceId: string): Promise<{
    avgCpu: number;
    avgRam: number;
    maxCpu: number;
    maxRam: number;
    samples: number;
  }> {
    const telemetry = await this.getLatestTelemetry(deviceId, 100);

    if (telemetry.length === 0) {
      return {
        avgCpu: 0,
        avgRam: 0,
        maxCpu: 0,
        maxRam: 0,
        samples: 0,
      };
    }

    const cpuValues = telemetry.map(t => t.cpu_percent);
    const ramValues = telemetry.map(t => t.ram_percent);

    return {
      avgCpu: Math.round(cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length),
      avgRam: Math.round(ramValues.reduce((a, b) => a + b, 0) / ramValues.length),
      maxCpu: Math.max(...cpuValues),
      maxRam: Math.max(...ramValues),
      samples: telemetry.length,
    };
  }
}
