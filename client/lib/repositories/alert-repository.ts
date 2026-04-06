import {
  BaseRepository,
  type QueryOptions,
  type PaginatedResult,
  type PaginationOptions,
} from '@/lib/repositories/base-repository';
import type {
  Alert,
  AlertStatus,
  AlertSeverity,
  RealtimeAlertPayload,
} from '@/lib/supabase/types';

const ACTIVE_STATUSES: AlertStatus[] = ['PENDING', 'ACKNOWLEDGED', 'INVESTIGATED'];

const DEFAULT_ALERT_SELECT = `
  alert_id,
  device_id,
  device_name,
  title,
  description,
  severity,
  status,
  category,
  confidence,
  anomaly_score,
  model_id,
  collection_agent_version,
  inference_latency_ms,
  telemetry_source,
  detection_window_start,
  detection_window_end,
  detection_window_minutes,
  net_destination_ip,
  net_destination_port,
  net_protocol,
  net_duration_ms,
  proc_name,
  proc_privilege_level,
  proc_pid,
  created_at,
  acknowledged_at,
  acknowledged_by,
  investigated_at,
  investigated_by,
  closed_at,
  closed_by,
  read
`.trim();

const METRICS_SELECT =
  'status,severity,anomaly_score,confidence,inference_latency_ms,created_at,closed_at';

export interface AlertQueryOptions extends QueryOptions {
  deviceId?: string;
  status?: AlertStatus | AlertStatus[];
  severity?: AlertSeverity | AlertSeverity[];
  category?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  minAnomalyScore?: number;
  maxAnomalyScore?: number;
  unreadOnly?: boolean;
}

export interface AlertMetrics {
  total: number;
  pending: number;
  acknowledged: number;
  investigated: number;
  closed: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  avgAnomalyScore: number;
  avgInferenceLatency: number;
  threatsBlocked: number;
  resolvedToday: number;
}

export interface AlertSubscriptionCallbacks {
  onInsert?: (alert: Alert) => void;
  onUpdate?: (alert: Alert) => void;
  onDelete?: (alert: Alert) => void;
  onError?: (error: unknown) => void;
}

export class AlertRepository extends BaseRepository<Alert> {
  constructor() {
    super('alerts');
  }

  private buildAlertQuery(options: AlertQueryOptions) {
    const standardFilters: Record<string, unknown> = {};

    if (options.deviceId) standardFilters.device_id = options.deviceId;
    if (options.status) standardFilters.status = options.status;
    if (options.severity) standardFilters.severity = options.severity;
    if (options.category) standardFilters.category = options.category;
    if (options.unreadOnly) standardFilters.read = false;

    let query = this.buildQuery({
      select: options.select ?? DEFAULT_ALERT_SELECT,
      filters: standardFilters,
      orderBy: options.orderBy,
      limit: options.limit,
      offset: options.offset,
    });

    if (options.startDate) query = query.gte('created_at', options.startDate);
    if (options.endDate) query = query.lte('created_at', options.endDate);

    if (options.minAnomalyScore !== undefined) query = query.gte('anomaly_score', options.minAnomalyScore);
    if (options.maxAnomalyScore !== undefined) query = query.lte('anomaly_score', options.maxAnomalyScore);

    if (options.search) {
      const s = options.search.replace(/[%_]/g, '\\$&'); // escape wildcards
      query = query.or(
        `title.ilike.%${s}%,description.ilike.%${s}%,device_name.ilike.%${s}%,category.ilike.%${s}%`
      );
    }

    return query;
  }

  async findAlerts(options: AlertQueryOptions = {}): Promise<Alert[]> {
    const cacheKey = options.cacheKey ?? `alerts_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildAlertQuery(options);
        if (error) throw this.handleError(error);
        return (data ?? []) as unknown as Alert[];
      },
      options.cacheTTL
    );
  }

  async findAlertsPaginated(
    options: AlertQueryOptions & PaginationOptions
  ): Promise<PaginatedResult<Alert>> {
    const { page, limit, ...queryOptions } = options;

    const filters: Record<string, unknown> = {};

    if (queryOptions.deviceId) filters.device_id = queryOptions.deviceId;
    if (queryOptions.status) filters.status = queryOptions.status;
    if (queryOptions.severity) filters.severity = queryOptions.severity;
    if (queryOptions.category) filters.category = queryOptions.category;
    if (queryOptions.unreadOnly) filters.read = false;

    const additionalFilters: Record<string, unknown> = {};

    if (queryOptions.startDate || queryOptions.endDate) {
      const dateFilter: Record<string, unknown> = {};
      if (queryOptions.startDate) dateFilter.gte = queryOptions.startDate;
      if (queryOptions.endDate) dateFilter.lte = queryOptions.endDate;
      additionalFilters.created_at = dateFilter;
    }

    if (queryOptions.minAnomalyScore !== undefined || queryOptions.maxAnomalyScore !== undefined) {
      const scoreFilter: Record<string, unknown> = {};
      if (queryOptions.minAnomalyScore !== undefined) scoreFilter.gte = queryOptions.minAnomalyScore;
      if (queryOptions.maxAnomalyScore !== undefined) scoreFilter.lte = queryOptions.maxAnomalyScore;
      additionalFilters.anomaly_score = scoreFilter;
    }

    const combinedFilters = { ...filters, ...additionalFilters };

    if (queryOptions.search) {
      return this.findAlertsWithSearchPaginated(options);
    }

    return this.findPaginated({
      page,
      limit,
      select: queryOptions.select ?? DEFAULT_ALERT_SELECT,
      filters: combinedFilters,
      orderBy: queryOptions.orderBy,
      cacheTTL: queryOptions.cacheTTL
    });
  }

  private async findAlertsWithSearchPaginated(
    options: AlertQueryOptions & PaginationOptions
  ): Promise<PaginatedResult<Alert>> {
    const { page, limit, search, ...queryOptions } = options;
    const offset = (page - 1) * limit;

    let query = this.buildAlertQuery({ ...queryOptions, search });

    query = query.range(offset, offset + limit - 1);

    const { count, error: countError } = await this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true });

    if (countError) throw this.handleError(countError);

    const { data, error } = await query;
    if (error) throw this.handleError(error);

    const totalPages = Math.ceil((count ?? 0) / limit);

    return {
      data: (data ?? []) as unknown as Alert[],
      count: count ?? 0,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  async getRecentAlerts(limit = 50): Promise<Alert[]> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    return this.findAlerts({
      startDate: yesterday.toISOString(),
      orderBy: { column: 'created_at', ascending: false },
      limit,
      cacheTTL: 30 * 1000,
    });
  }

  async getActiveAlerts(limit = 100): Promise<Alert[]> {
    return this.findAlerts({
      status: ACTIVE_STATUSES,
      orderBy: { column: 'created_at', ascending: false },
      limit,
      cacheTTL: 60 * 1000,
    });
  }

  async getPendingAlerts(): Promise<Alert[]> {
    return this.findAlerts({
      status: 'PENDING',
      orderBy: { column: 'created_at', ascending: false },
      cacheTTL: 30 * 1000,
    });
  }

  async getAlertsByDevice(deviceId: string, limit = 50): Promise<Alert[]> {
    return this.findAlerts({
      deviceId,
      orderBy: { column: 'created_at', ascending: false },
      limit,
      cacheTTL: 2 * 60 * 1000,
    });
  }

  async getCriticalAlerts(): Promise<Alert[]> {
    return this.findAlerts({
      severity: 'critical',
      status: ACTIVE_STATUSES,
      orderBy: { column: 'created_at', ascending: false },
      cacheTTL: 30 * 1000,
    });
  }

  async getAlertsNeedingAttention(): Promise<Alert[]> {
    return this.findAlerts({
      status: ['PENDING', 'ACKNOWLEDGED'],
      severity: ['critical', 'high'],
      orderBy: { column: 'created_at', ascending: false },
      limit: 20,
      cacheTTL: 30 * 1000,
    });
  }

  async searchAlerts(query: string, options: AlertQueryOptions = {}): Promise<Alert[]> {
    return this.findAlerts({ ...options, search: query });
  }

  async updateAlertStatus(
    id: string,
    status: AlertStatus,
    userId?: string
  ): Promise<Alert> {
    return this.update(id, buildStatusTransition(status, userId));
  }

  async markAsRead(id: string): Promise<Alert> {
    return this.update(id, { read: true });
  }

  async markMultipleAsRead(ids: string[]): Promise<void> {
    await this.updateMany({ id: ids }, { read: true });
  }

  async bulkUpdateStatus(
    ids: string[],
    status: AlertStatus,
    userId?: string
  ): Promise<Alert[]> {
    return this.updateMany({ id: ids }, buildStatusTransition(status, userId));
  }

  async getAlertMetrics(): Promise<AlertMetrics> {
    return this.cachedQuery(
      'alert_metrics',
      async () => {
        const alerts = await this.findAlerts({ select: METRICS_SELECT });

        const today = new Date().toDateString();

        // Single-pass accumulation
        const metrics: AlertMetrics = {
          total: alerts.length,
          pending: 0,
          acknowledged: 0,
          investigated: 0,
          closed: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          avgAnomalyScore: 0,
          avgInferenceLatency: 0,
          threatsBlocked: 0,
          resolvedToday: 0,
        };

        let scoreSum = 0;
        let scoreCount = 0;
        let latencySum = 0;
        let latencyCount = 0;

        for (const a of alerts) {
          switch (a.status) {
            case 'PENDING': metrics.pending++; break;
            case 'ACKNOWLEDGED': metrics.acknowledged++; break;
            case 'INVESTIGATED': metrics.investigated++; break;
            case 'CLOSED': metrics.closed++; break;
          }

          switch (a.severity) {
            case 'critical': metrics.critical++; break;
            case 'high': metrics.high++; break;
            case 'medium': metrics.medium++; break;
            case 'low': metrics.low++; break;
          }

          const score = anomalyScore(a);
          if (score !== null) {
            scoreSum += score;
            scoreCount++;
          }

          if ((a.inference_latency_ms ?? 0) > 0) {
            latencySum += a.inference_latency_ms;
            latencyCount++;
          }

          if (
            a.status === 'CLOSED' &&
            (a.severity === 'critical' || a.severity === 'high')
          ) {
            metrics.threatsBlocked++;
          }

          // Resolved today
          if (
            a.status === 'CLOSED' &&
            a.closed_at &&
            new Date(a.closed_at).toDateString() === today
          ) {
            metrics.resolvedToday++;
          }
        }

        if (scoreCount > 0) metrics.avgAnomalyScore = scoreSum / scoreCount;
        if (latencyCount > 0) metrics.avgInferenceLatency = latencySum / latencyCount;

        return metrics;
      },
      60 * 1000
    );
  }

  async getAlertsByTimeRange(
    startDate: string,
    endDate: string,
    groupBy: 'hour' | 'day' | 'week' = 'day'
  ): Promise<{ timestamp: string; count: number }[]> {
    const cacheKey = `alerts_time_range_${startDate}_${endDate}_${groupBy}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const alerts = await this.findAlerts({
          startDate,
          endDate,
          select: 'created_at',
        });

        const grouped = new Map<string, number>();

        for (const alert of alerts) {
          const key = toGroupKey(new Date(alert.created_at), groupBy);
          grouped.set(key, (grouped.get(key) ?? 0) + 1);
        }

        return Array.from(grouped.entries())
          .map(([timestamp, count]) => ({ timestamp, count }))
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      },
      5 * 60 * 1000
    );
  }

  async getTopCategories(limit = 10): Promise<{ category: string; count: number }[]> {
    const cacheKey = `top_categories_${limit}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const alerts = await this.findAlerts({ select: 'category' });

        const counts = new Map<string, number>();
        for (const alert of alerts) {
          if (alert.category) {
            counts.set(alert.category, (counts.get(alert.category) ?? 0) + 1);
          }
        }

        return Array.from(counts.entries())
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);
      },
      10 * 60 * 1000
    );
  }

  // ── Realtime ───────────────────────────────────────────────────────────────
  subscribeToAlerts(
    filters: Partial<AlertQueryOptions> = {},
    callbacks: AlertSubscriptionCallbacks = {}
  ): string {
    const channelName = `realtime-alerts-${Date.now()}`;

    this.subscribe(channelName, filters, (payload) => {
      try {
        const p = payload as RealtimeAlertPayload;
        switch (p.eventType) {
          case 'INSERT': callbacks.onInsert?.(p.new); break;
          case 'UPDATE': callbacks.onUpdate?.(p.new); break;
          case 'DELETE': callbacks.onDelete?.(p.old as Alert); break;
        }
      } catch (error) {
        callbacks.onError?.(error);
      }
    });

    return channelName;
  }

  unsubscribeFromAlerts(channelName: string): void {
    this.unsubscribe(channelName);
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function anomalyScore(alert: Alert): number | null {
  if (alert.anomaly_score != null) return alert.anomaly_score;
  if (alert.confidence != null) return alert.confidence;
  return null;
}

function buildStatusTransition(status: AlertStatus, userId?: string): Partial<Alert> {
  const now = new Date().toISOString();
  const updates: Partial<Alert> = { status };

  switch (status) {
    case 'ACKNOWLEDGED':
      updates.acknowledged_at = now;
      if (userId) updates.acknowledged_by = userId;
      break;
    case 'INVESTIGATED':
      updates.investigated_at = now;
      if (userId) updates.investigated_by = userId;
      break;
    case 'CLOSED':
      updates.closed_at = now;
      if (userId) updates.closed_by = userId;
      break;
  }

  return updates;
}

function toGroupKey(date: Date, groupBy: 'hour' | 'day' | 'week'): string {
  switch (groupBy) {
    case 'hour':
      return date.toISOString().slice(0, 13) + ':00';
    case 'week': {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return weekStart.toISOString().slice(0, 10);
    }
    default:
      return date.toISOString().slice(0, 10);
  }
}