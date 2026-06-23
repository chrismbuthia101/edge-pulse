import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ReportService } from "@/lib/services/report-service";
import type { ReportMetrics } from "@/lib/repositories/report-repository";
import { errorMessage } from "@/lib/utils/error";
import { toast } from "sonner";
import { createClient } from "@/lib/config/client";

type Status = "idle" | "loading" | "success" | "error";

let reportService: ReportService | null = null;
function getReportService(): ReportService {
  if (!reportService) {
    reportService = new ReportService(createClient());
  }
  return reportService;
}

const initialState = {
  reportData: null as ReportMetrics | null,
  status: "idle" as Status,
  error: null as string | null,
  dateRange: "7d",
};

type ReportStore = typeof initialState & {
  initialize: (supabaseClient: SupabaseClient) => void;
  refreshReportData: () => Promise<void>;
  setDateRange: (dateRange: string) => void;
  generateReport: (format: "pdf" | "csv") => Promise<void>;
  clearError: () => void;
};

export const useReportStore = create<ReportStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      initialize: (supabaseClient: SupabaseClient) => {
        reportService = new ReportService(supabaseClient);
      },

      refreshReportData: async () => {
        set({ status: "loading" });
        const { data, error } = await getReportService().getReportMetrics({
          dateRange: get().dateRange,
        });
        if (error) {
          set({ error: errorMessage(error), status: "error" });
        } else {
          set({ reportData: data, status: "success" });
        }
      },

      setDateRange: (dateRange: string) => {
        set({ dateRange });
        get().refreshReportData();
      },

      generateReport: async (format: "pdf" | "csv") => {
        try {
          toast.loading(`Generating ${format.toUpperCase()} report...`);

          const { data, error } = await getReportService().generateReport({
            format,
            dateRange: get().dateRange,
            includeCharts: true,
          });

          if (error) throw new Error(error.message);

          if (data?.url) {
            const link = document.createElement("a");
            link.href = data.url;
            link.download = `edgepulse-report-${new Date().toISOString().split("T")[0]}.${format}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success(
              `${format.toUpperCase()} report generated successfully`,
            );
          } else {
            throw new Error("No download URL received");
          }
        } catch (err) {
          console.error("Failed to generate report:", err);
          toast.error("Failed to generate report");
        }
      },

      clearError: () => set({ error: null }),
    }),
    { name: "ReportStore" },
  ),
);
