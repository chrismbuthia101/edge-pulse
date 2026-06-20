import { AuditLogRepository } from "@/lib/repositories/audit-log-repository";
import type { AuditLogEntry } from "@/lib/supabase/types";

export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}

  async getLogs(limit = 200): Promise<AuditLogEntry[]> {
    try {
      return await this.repository.findMany({
        limit,
        orderBy: { column: "timestamp", ascending: false },
      });
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
      return [];
    }
  }
}

export const auditLogService = new AuditLogService(new AuditLogRepository());
