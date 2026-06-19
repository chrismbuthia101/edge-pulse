import {
  BaseRepository,
  type QueryOptions,
} from '@/lib/repositories/base-repository';

export interface ReportMetrics {
  totalAlerts: number;
  criticalAlerts: number;
  activeDevices: number;
  totalDevices: number;
  avgResponseTime: number;
  alertsBySeverity: Record<string, number>;
  alertsByDevice: Record<string, number>;
  recentAlerts: Array<{
    id: string;
    severity: string;
    device_id: string;
    created_at: string;
    explanation_json: unknown;
  }>;
}

export interface ReportQueryOptions extends QueryOptions {
  startDate?: string;
  endDate?: string;
}

export class ReportRepository extends BaseRepository {
  constructor() {
    super('alerts');
  }

  async getReportMetrics(options: ReportQueryOptions = {}): Promise<ReportMetrics> {
    const cacheKey = `report_metrics_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        let query = this.supabase
          .from('alerts')
          .select('*')
          .order('created_at', { ascending: false });

        if (options.startDate) {
          query = query.gte('created_at', options.startDate);
        }
        if (options.endDate) {
          query = query.lte('created_at', options.endDate);
        }

        const { data: alerts, error: alertsError } = await query;
        if (alertsError) throw alertsError;

        const { data: devices, error: devicesError } = await this.supabase
          .from('devices')
          .select('*');

        if (devicesError) throw devicesError;

        const alertsList = alerts || [];
        const devicesList = devices || [];

        const totalAlerts = alertsList.length;
        const criticalAlerts = alertsList.filter((a: { severity: string }) => a.severity === 'critical').length;
        const activeDevices = devicesList.filter((d: { is_active: boolean }) => d.is_active).length;
        const totalDevices = devicesList.length;

        const alertsBySeverity = alertsList.reduce((acc: Record<string, number>, alert: { severity: string }) => {
          const severity = alert.severity || 'unknown';
          acc[severity] = (acc[severity] || 0) + 1;
          return acc;
        }, {});

        const alertsByDevice = alertsList.reduce((acc: Record<string, number>, alert: { device_id: string }) => {
          const deviceId = alert.device_id || 'unknown';
          acc[deviceId] = (acc[deviceId] || 0) + 1;
          return acc;
        }, {});

        const recentAlerts = alertsList.slice(0, 10).map((alert: { id: string; severity: string; device_id: string; created_at: string; explanation_json: unknown }) => ({
          id: alert.id,
          severity: alert.severity || 'unknown',
          device_id: alert.device_id || 'unknown',
          created_at: alert.created_at,
          explanation_json: alert.explanation_json,
        }));

        return {
          totalAlerts,
          criticalAlerts,
          activeDevices,
          totalDevices,
          avgResponseTime: 0,
          alertsBySeverity,
          alertsByDevice,
          recentAlerts,
        };
      },
      60 * 1000
    );
  }

  async generateReport(format: 'pdf' | 'csv', options: ReportQueryOptions = {}): Promise<{ url: string }> {
    const { data, error } = await this.supabase.functions.invoke('generate-report', {
      body: { format, dateRange: options, includeCharts: true },
    });

    if (error) throw error;
    return data;
  }
}
