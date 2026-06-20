import { create } from "zustand";
import { LogsRepository } from "@/lib/repositories";
import { LogsService } from "@/lib/services/logs-service";
import type { AuditLogEntry } from "@/lib/supabase/types";
import type { AuditLogQueryOptions } from "@/lib/repositories/logs-repository";
import { errorMessage } from "@/lib/utils/error";

interface LogsStore {
  logs: AuditLogEntry[];
  loading: boolean;
  searchTerm: string;
  error: string | null;

  initialize: () => Promise<void>;
  setSearchTerm: (term: string) => void;
  refreshLogs: (options?: AuditLogQueryOptions) => Promise<void>;
  clearError: () => void;

  getFilteredLogs: () => AuditLogEntry[];
}

const logsRepository = new LogsRepository();
const logsService = new LogsService({
  repository: logsRepository,
});

export const useLogsStore = create<LogsStore>((set, get) => ({
  logs: [],
  loading: false,
  searchTerm: "",
  error: null,

  initialize: async () => {
    try {
      set({ loading: true, error: null });
      const logs = await logsService.getRecentAuditLogs(100);
      set({ logs, loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  setSearchTerm: (term) => {
    set({ searchTerm: term });
  },

  refreshLogs: async (options) => {
    try {
      set({ loading: true, error: null });
      const logs = await logsService.getAuditLogs(options);
      set({ logs, loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
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
}));

export { logsService, logsRepository };
