import { BaseRepository } from "@/lib/repositories/base-repository";
import type { AuditLogEntry } from "@/lib/supabase/types";

export interface AuditLogCreateInput {
  user_id?: string | null;
  device_id?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  severity?: "INFO" | "WARNING" | "ERROR";
  ip_address?: string | null;
  user_agent?: string | null;
  organization_id?: string | null;
}

export class AuditLogRepository extends BaseRepository<AuditLogEntry> {
  constructor() {
    super("audit_logs");
    this.schema = "internal";
  }

  async write(entry: AuditLogCreateInput): Promise<AuditLogEntry> {
    return this.create(
      entry as unknown as Partial<AuditLogEntry>,
    ) as unknown as Promise<AuditLogEntry>;
  }

  async findByOrganization(
    organizationId: string,
    limit = 100,
  ): Promise<AuditLogEntry[]> {
    try {
      const { data, error } = await this.getClient()
        .from(this.tableName)
        .select("*")
        .eq("organization_id", organizationId)
        .order("timestamp", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async findByResource(
    resourceType: string,
    resourceId: string,
    limit = 100,
  ): Promise<AuditLogEntry[]> {
    try {
      const { data, error } = await this.getClient()
        .from(this.tableName)
        .select("*")
        .eq("resource_type", resourceType)
        .eq("resource_id", resourceId)
        .order("timestamp", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      throw this.handleError(error);
    }
  }
}
