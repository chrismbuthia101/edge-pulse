import { BaseRepository, type QueryOptions, type PaginatedResult, type PaginationOptions } from '@/lib/repositories/base-repository';
import type { AuditLogEntry } from '@/lib/supabase/types';

export interface AuditLogQueryOptions extends QueryOptions {
  userId?: string;
  deviceId?: string;
  action?: string;
  resourceType?: string;
  severity?: 'INFO' | 'WARNING' | 'ERROR';
  organizationId?: string;
  startDate?: string;
  endDate?: string;
}

export class LogsRepository extends BaseRepository<AuditLogEntry> {
  constructor() {
    super('audit_logs');
    this.schema = 'internal';
  }

  private buildAuditLogQuery(options: AuditLogQueryOptions) {
    const standardFilters: Record<string, unknown> = {};

    if (options.userId) standardFilters.user_id = options.userId;
    if (options.deviceId) standardFilters.device_id = options.deviceId;
    if (options.action) standardFilters.action = options.action;
    if (options.resourceType) standardFilters.resource_type = options.resourceType;
    if (options.severity) standardFilters.severity = options.severity;
    if (options.organizationId) standardFilters.organization_id = options.organizationId;

    let query = this.buildQuery({
      select: options.select ?? '*',
      filters: standardFilters,
      orderBy: options.orderBy ?? { column: 'timestamp', ascending: false },
      limit: options.limit,
      offset: options.offset,
    });

    if (options.startDate) query = query.gte('timestamp', options.startDate);
    if (options.endDate) query = query.lte('timestamp', options.endDate);

    return query;
  }

  async findAuditLogs(options: AuditLogQueryOptions = {}): Promise<AuditLogEntry[]> {
    const cacheKey = options.cacheKey ?? `audit_logs_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildAuditLogQuery(options);
        if (error) throw this.handleError(error);
        return (data ?? []) as unknown as AuditLogEntry[];
      },
      options.cacheTTL
    );
  }

  async findAuditLogsPaginated(
    options: AuditLogQueryOptions & PaginationOptions
  ): Promise<PaginatedResult<AuditLogEntry>> {
    const { page, limit, ...queryOptions } = options;

    const filters: Record<string, unknown> = {};
    if (queryOptions.userId) filters.user_id = queryOptions.userId;
    if (queryOptions.deviceId) filters.device_id = queryOptions.deviceId;
    if (queryOptions.action) filters.action = queryOptions.action;
    if (queryOptions.resourceType) filters.resource_type = queryOptions.resourceType;
    if (queryOptions.severity) filters.severity = queryOptions.severity;
    if (queryOptions.organizationId) filters.organization_id = queryOptions.organizationId;

    // Use findPaginated when no date filters
    if (!queryOptions.startDate && !queryOptions.endDate) {
      return this.findPaginated({
        page,
        limit,
        select: queryOptions.select ?? '*',
        filters,
        orderBy: queryOptions.orderBy ?? { column: 'timestamp', ascending: false },
        cacheTTL: queryOptions.cacheTTL,
      });
    }

    // Custom pagination with date filters
    return this.findAuditLogsWithRangePaginated(options);
  }

  private async findAuditLogsWithRangePaginated(
    options: AuditLogQueryOptions & PaginationOptions
  ): Promise<PaginatedResult<AuditLogEntry>> {
    const { page, limit, ...queryOptions } = options;
    const offset = (page - 1) * limit;

    let query = this.buildAuditLogQuery(queryOptions);
    query = query.range(offset, offset + limit - 1);

    const { count, error: countError } = await this.getClient()
      .from(this.tableName)
      .select('*', { count: 'exact', head: true });
    if (countError) throw this.handleError(countError);

    const { data, error } = await query;
    if (error) throw this.handleError(error);

    const totalPages = Math.ceil((count ?? 0) / limit);

    return {
      data: (data ?? []) as unknown as AuditLogEntry[],
      count: count ?? 0,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  async getAuditLogsByUser(userId: string, limit = 50): Promise<AuditLogEntry[]> {
    return this.findAuditLogs({
      userId,
      orderBy: { column: 'timestamp', ascending: false },
      limit,
      cacheTTL: 2 * 60 * 1000,
    });
  }

  async getAuditLogsByDevice(deviceId: string, limit = 50): Promise<AuditLogEntry[]> {
    return this.findAuditLogs({
      deviceId,
      orderBy: { column: 'timestamp', ascending: false },
      limit,
      cacheTTL: 2 * 60 * 1000,
    });
  }

  async getRecentAuditLogs(limit = 100): Promise<AuditLogEntry[]> {
    return this.findAuditLogs({
      orderBy: { column: 'timestamp', ascending: false },
      limit,
      cacheTTL: 30 * 1000,
    });
  }

  async createAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    return this.create(entry as unknown as Partial<AuditLogEntry>) as unknown as Promise<AuditLogEntry>;
  }
}
