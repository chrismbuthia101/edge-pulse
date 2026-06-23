import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLogEntry } from "@/lib/types/logs";

type FilterValue = string | number | boolean | string[];

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface AuditLogQueryOptions {
  select?: string;
  orderBy?: { column: string; ascending: boolean };
  limit?: number;
  offset?: number;
  userId?: string;
  deviceId?: string;
  action?: string;
  resourceType?: string;
  severity?: "INFO" | "WARNING" | "ERROR";
  organizationId?: string;
  startDate?: string;
  endDate?: string;
}

export class LogsRepository {
  private readonly schema = "internal";
  private readonly tableName = "audit_logs";

  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async findAuditLogs(
    options: AuditLogQueryOptions = {},
  ): Promise<{ data: AuditLogEntry[] | null; error: Error | null }> {
    try {
      const query = this.buildAuditLogQuery(options);
      const { data, error } = await query;
      if (error) throw error;
      return { data: (data ?? []) as unknown as AuditLogEntry[], error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to find audit logs"),
      };
    }
  }

  public async findAuditLogsPaginated(
    options: AuditLogQueryOptions & { page: number; limit: number },
  ): Promise<{ data: PaginatedResult<AuditLogEntry> | null; error: Error | null }> {
    try {
      const { page, limit, ...queryOptions } = options;
      const offset = (page - 1) * limit;

      const client = this.supabaseClient.schema(this.schema).from(this.tableName);

      let countQuery = client.select("*", { count: "exact", head: true });
      if (queryOptions.userId) countQuery = countQuery.eq("user_id", queryOptions.userId);
      if (queryOptions.deviceId) countQuery = countQuery.eq("device_id", queryOptions.deviceId);
      if (queryOptions.action) countQuery = countQuery.eq("action", queryOptions.action);
      if (queryOptions.resourceType) countQuery = countQuery.eq("resource_type", queryOptions.resourceType);
      if (queryOptions.severity) countQuery = countQuery.eq("severity", queryOptions.severity);
      if (queryOptions.organizationId) countQuery = countQuery.eq("organization_id", queryOptions.organizationId);
      if (queryOptions.startDate) countQuery = countQuery.gte("timestamp", queryOptions.startDate);
      if (queryOptions.endDate) countQuery = countQuery.lte("timestamp", queryOptions.endDate);

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      let dataQuery = this.buildAuditLogQuery(queryOptions);
      dataQuery = dataQuery.range(offset, offset + limit - 1);

      const { data, error } = await dataQuery;
      if (error) throw error;

      const totalPages = Math.ceil((count ?? 0) / limit);

      return {
        data: {
          data: (data ?? []) as unknown as AuditLogEntry[],
          count: count ?? 0,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to find audit logs paginated"),
      };
    }
  }

  public async getAuditLogsByUser(
    userId: string,
    limit = 50,
  ): Promise<{ data: AuditLogEntry[] | null; error: Error | null }> {
    return this.findAuditLogs({
      userId,
      orderBy: { column: "timestamp", ascending: false },
      limit,
    });
  }

  public async getAuditLogsByDevice(
    deviceId: string,
    limit = 50,
  ): Promise<{ data: AuditLogEntry[] | null; error: Error | null }> {
    return this.findAuditLogs({
      deviceId,
      orderBy: { column: "timestamp", ascending: false },
      limit,
    });
  }

  public async findByOrganization(
    organizationId: string,
    limit = 100,
  ): Promise<{ data: AuditLogEntry[]; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .select("*")
        .eq("organization_id", organizationId)
        .order("timestamp", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find audit logs by organization"),
      };
    }
  }

  public async getRecentAuditLogs(
    limit = 100,
  ): Promise<{ data: AuditLogEntry[] | null; error: Error | null }> {
    return this.findAuditLogs({
      orderBy: { column: "timestamp", ascending: false },
      limit,
    });
  }

  public async createAuditLog(
    entry: Omit<AuditLogEntry, "id" | "timestamp">,
  ): Promise<{ data: AuditLogEntry | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .insert(entry)
        .select()
        .single();

      if (error) throw error;
      return { data: data as unknown as AuditLogEntry, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to create audit log"),
      };
    }
  }

  public async findByResource(
    resourceType: string,
    resourceId: string,
    limit = 100,
  ): Promise<{ data: AuditLogEntry[]; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .select("*")
        .eq("resource_type", resourceType)
        .eq("resource_id", resourceId)
        .order("timestamp", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find audit logs by resource"),
      };
    }
  }

  private buildAuditLogQuery(options: AuditLogQueryOptions) {
    const standardFilters: Record<string, FilterValue> = {};

    if (options.userId) standardFilters.user_id = options.userId;
    if (options.deviceId) standardFilters.device_id = options.deviceId;
    if (options.action) standardFilters.action = options.action;
    if (options.resourceType) standardFilters.resource_type = options.resourceType;
    if (options.severity) standardFilters.severity = options.severity;
    if (options.organizationId) standardFilters.organization_id = options.organizationId;

    let query = this.supabaseClient
      .schema(this.schema)
      .from(this.tableName)
      .select(options.select ?? "*")
      .order(options.orderBy?.column ?? "timestamp", {
        ascending: options.orderBy?.ascending ?? false,
      });

    for (const [key, value] of Object.entries(standardFilters)) {
      if (Array.isArray(value)) {
        query = query.in(key, value);
      } else {
        query = query.eq(key, value as string | number | boolean);
      }
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.range(options.offset, options.offset + (options.limit ?? 20) - 1);

    if (options.startDate) query = query.gte("timestamp", options.startDate);
    if (options.endDate) query = query.lte("timestamp", options.endDate);

    return query;
  }
}
