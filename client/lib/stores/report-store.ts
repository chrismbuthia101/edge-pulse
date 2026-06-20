import { create } from "zustand";
import { ReportRepository } from "@/lib/repositories";
import { ReportService } from "@/lib/services/report-service";
import type { ReportMetrics } from "@/lib/repositories/report-repository";
import { errorMessage } from "@/lib/utils/error";
import { toast } from "sonner";

interface ReportStore {
  reportData: ReportMetrics | null;
  loading: boolean;
  error: string | null;
  dateRange: string;

  initialize: () => Promise<void>;
  refreshReportData: () => Promise<void>;
  setDateRange: (dateRange: string) => void;
  generateReport: (format: "pdf" | "csv") => Promise<void>;
  clearError: () => void;
}

const reportRepository = new ReportRepository();
const reportService = new ReportService(reportRepository);

export const useReportStore = create<ReportStore>((set, get) => ({
  reportData: null,
  loading: false,
  error: null,
  dateRange: "7d",

  initialize: async () => {
    try {
      set({ loading: true, error: null });
      const reportData = await reportService.getReportMetrics({
        dateRange: get().dateRange,
      });
      set({ reportData, loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  refreshReportData: async () => {
    try {
      set({ loading: true, error: null });
      const reportData = await reportService.getReportMetrics({
        dateRange: get().dateRange,
      });
      set({ reportData, loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  setDateRange: (dateRange: string) => {
    set({ dateRange });
    get().refreshReportData();
  },

  generateReport: async (format: "pdf" | "csv") => {
    try {
      toast.loading(`Generating ${format.toUpperCase()} report...`);

      const result = await reportService.generateReport({
        format,
        dateRange: get().dateRange,
        includeCharts: true,
      });

      if (result?.url) {
        const link = document.createElement("a");
        link.href = result.url;
        link.download = `edgepulse-report-${new Date().toISOString().split("T")[0]}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`${format.toUpperCase()} report generated successfully`);
      } else {
        throw new Error("No download URL received");
      }
    } catch (err) {
      console.error("Failed to generate report:", err);
      toast.error("Failed to generate report");
    }
  },

  clearError: () => set({ error: null }),
}));

export { reportService, reportRepository };
