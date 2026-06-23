import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ReportRepository,
  type ReportMetrics,
  type ReportQueryOptions,
} from "@/lib/repositories/report-repository";

export interface GetReportOptions extends ReportQueryOptions {
  dateRange?: string;
}

export interface GenerateReportOptions {
  format: "pdf" | "csv";
  dateRange?: string;
  includeCharts?: boolean;
}

export class ReportService {
  private readonly repository: ReportRepository;

  constructor(supabaseClient: SupabaseClient) {
    this.repository = new ReportRepository(supabaseClient);
  }

  public async getReportMetrics(
    options: GetReportOptions = {},
  ): Promise<{ data: ReportMetrics | null; error: Error | null }> {
    try {
      let startDate: string | undefined;
      if (options.dateRange) {
        const now = new Date();
        const start = new Date();

        switch (options.dateRange) {
          case "1d":
            start.setDate(now.getDate() - 1);
            break;
          case "7d":
            start.setDate(now.getDate() - 7);
            break;
          case "30d":
            start.setDate(now.getDate() - 30);
            break;
          case "90d":
            start.setDate(now.getDate() - 90);
            break;
          default:
            start.setDate(now.getDate() - 7);
        }

        startDate = start.toISOString();
      }

      return await this.repository.getReportMetrics({
        ...options,
        startDate,
      });
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get report metrics"),
      };
    }
  }

  public async generateReport(
    options: GenerateReportOptions,
  ): Promise<{ data: { url: string } | null; error: Error | null }> {
    try {
      return await this.repository.generateReport(options.format, {});
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to generate report"),
      };
    }
  }
}
