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
  constructor(private readonly repository: ReportRepository) {}

  async getReportMetrics(
    options: GetReportOptions = {},
  ): Promise<ReportMetrics> {
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

    return this.repository.getReportMetrics({
      ...options,
      startDate,
    });
  }

  async generateReport(
    options: GenerateReportOptions,
  ): Promise<{ url: string }> {
    return this.repository.generateReport(options.format, {});
  }
}
