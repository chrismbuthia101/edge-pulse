import { LogsRepository } from "@/lib/repositories";
import type { AuditLogEntry } from "@/lib/types/logs";
import type { AuditLogQueryOptions } from "@/lib/repositories/logs-repository";
import type { Result } from "@/lib/types/shared";

export class LogsService {
  static getRecentAuditLogs() {
    throw new Error("Method not implemented.");
  }
  constructor(private readonly repository: LogsRepository) {}

  public async getAuditLogs(
    options: AuditLogQueryOptions = {},
  ): Promise<Result<AuditLogEntry[]>> {
    const { data, error } = await this.repository.findAuditLogs(options);
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  }

  public async getLogsForOrganization(
    organizationId: string,
    limit = 100,
  ): Promise<Result<AuditLogEntry[]>> {
    const { data, error } = await this.repository.findByOrganization(
      organizationId,
      limit,
    );
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getLogsForResource(
    resourceType: string,
    resourceId: string,
    limit = 100,
  ): Promise<Result<AuditLogEntry[]>> {
    const { data, error } = await this.repository.findByResource(
      resourceType,
      resourceId,
      limit,
    );
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getRecentAuditLogs(
    limit = 100,
  ): Promise<Result<AuditLogEntry[]>> {
    const { data, error } = await this.repository.getRecentAuditLogs(limit);
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  }
}

import { createClient } from "@/lib/config/client";
export const logsService = new LogsService(new LogsRepository(createClient()));
