import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LogsService } from "@/lib/services/logs-service";
import { LogsRepository } from "@/lib/repositories/logs-repository";
import type { AuditLogEntry } from "@/lib/types/logs";
import type { AuditLogQueryOptions } from "@/lib/repositories/logs-repository";
import { createClient } from "@/lib/config/client";

type Status = "idle" | "loading" | "success" | "error";

let logsService: LogsService | null = null;
function getLogsService(): LogsService {
  if (!logsService) {
    logsService = new LogsService(new LogsRepository(createClient()));
  }
  return logsService;
}

const initialState = {
  logs: [] as AuditLogEntry[],
  status: "idle" as Status,
  searchTerm: "",
  error: null as string | null,
};

type LogsStore = typeof initialState & {
  initialize: (supabaseClient: SupabaseClient) => void;
  setSearchTerm: (term: string) => void;
  refreshLogs: (options?: AuditLogQueryOptions) => Promise<void>;
  clearError: () => void;
  getFilteredLogs: () => AuditLogEntry[];
};

export const useLogsStore = create<LogsStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      initialize: (supabaseClient: SupabaseClient) => {
        logsService = new LogsService(new LogsRepository(supabaseClient));
      },

      setSearchTerm: (term) => {
        set({ searchTerm: term });
      },

      refreshLogs: async (options) => {
        set({ status: "loading" });
        const result = await getLogsService().getAuditLogs(options);
        if (!result.success) {
          set({ error: result.error, status: "error" });
        } else {
          set({ logs: result.data, status: "success" });
        }
      },

      clearError: () => set({ error: null }),

      getFilteredLogs: () => {
        const { logs, searchTerm } = get();

        if (!searchTerm) return logs;

        const term = searchTerm.toLowerCase();
        return logs.filter(
          (log) =>
            log.action.toLowerCase().includes(term) ||
            log.resource_type.toLowerCase().includes(term) ||
            log.severity.toLowerCase().includes(term),
        );
      },
    }),
    { name: "LogsStore" },
  ),
);
