import type { SupabaseClient } from "@supabase/supabase-js";

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

export interface ReportQueryOptions {
  select?: string;
  orderBy?: { column: string; ascending: boolean };
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

export class ReportRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async getReportMetrics(
    options: ReportQueryOptions = {},
  ): Promise<{ data: ReportMetrics | null; error: Error | null }> {
    try {
      let query = this.supabaseClient
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false });

      if (options.startDate) {
        query = query.gte("created_at", options.startDate);
      }
      if (options.endDate) {
        query = query.lte("created_at", options.endDate);
      }

      const { data: alerts, error: alertsError } = await query;
      if (alertsError) throw alertsError;

      const { data: devices, error: devicesError } = await this.supabaseClient
        .from("devices")
        .select("*");

      if (devicesError) throw devicesError;

      const alertsList = alerts || [];
      const devicesList = devices || [];

      const totalAlerts = alertsList.length;
      const criticalAlerts = alertsList.filter(
        (a: { severity: string }) => a.severity === "critical",
      ).length;
      const activeDevices = devicesList.filter(
        (d: { is_active: boolean }) => d.is_active,
      ).length;
      const totalDevices = devicesList.length;

      const alertsBySeverity = alertsList.reduce(
        (acc: Record<string, number>, alert: { severity: string }) => {
          const severity = alert.severity || "unknown";
          acc[severity] = (acc[severity] || 0) + 1;
          return acc;
        },
        {},
      );

      const alertsByDevice = alertsList.reduce(
        (acc: Record<string, number>, alert: { device_id: string }) => {
          const deviceId = alert.device_id || "unknown";
          acc[deviceId] = (acc[deviceId] || 0) + 1;
          return acc;
        },
        {},
      );

      const recentAlerts = alertsList
        .slice(0, 10)
        .map(
          (alert: {
            id: string;
            severity: string;
            device_id: string;
            created_at: string;
            explanation_json: unknown;
          }) => ({
            id: alert.id,
            severity: alert.severity || "unknown",
            device_id: alert.device_id || "unknown",
            created_at: alert.created_at,
            explanation_json: alert.explanation_json,
          }),
        );

      return {
        data: {
          totalAlerts,
          criticalAlerts,
          activeDevices,
          totalDevices,
          avgResponseTime: 0,
          alertsBySeverity,
          alertsByDevice,
          recentAlerts,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to get report metrics"),
      };
    }
  }

  public async generateReport(
    format: "pdf" | "csv",
    options: ReportQueryOptions = {},
  ): Promise<{ data: { url: string } | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient.functions.invoke(
        "generate-report",
        {
          body: { format, dateRange: options, includeCharts: true },
        },
      );

      if (error) throw error;
      return { data: data as { url: string }, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to generate report"),
      };
    }
  }
}
