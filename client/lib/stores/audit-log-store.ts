import { create } from "zustand";
import { AuditLogService } from "@/lib/services/audit-log-service";
import { AuditLogRepository } from "@/lib/repositories/audit-log-repository";
import type { AuditLogEntry } from "@/lib/supabase/types";

interface AuditLogStore {
  logs: AuditLogEntry[];
  loading: boolean;
  error: string | null;

  fetchLogs: () => Promise<void>;
}

const auditLogRepository = new AuditLogRepository();
const auditLogService = new AuditLogService(auditLogRepository);

export const useAuditLogStore = create<AuditLogStore>((set) => ({
  logs: [],
  loading: false,
  error: null,

  fetchLogs: async () => {
    set({ loading: true, error: null });
    try {
      const logs = await auditLogService.getLogs();
      set({ logs, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to fetch audit logs",
      });
    }
  },
}));

export { auditLogService, auditLogRepository };
