import { LogsRepository } from "@/lib/repositories";
import type { AuditLogEntry } from "@/lib/supabase/types";
import type { AuditLogQueryOptions } from "@/lib/repositories/logs-repository";

export interface LogsServiceDependencies {
  repository: LogsRepository;
}

export class LogsService {
  private repository: LogsRepository;

  constructor(dependencies: LogsServiceDependencies) {
    this.repository = dependencies.repository;
  }

  async getAuditLogs(
    options: AuditLogQueryOptions = {},
  ): Promise<AuditLogEntry[]> {
    return this.repository.findAuditLogs(options);
  }

  async getRecentAuditLogs(limit = 100): Promise<AuditLogEntry[]> {
    return this.repository.getRecentAuditLogs(limit);
  }
}
