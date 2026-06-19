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
  id,
  device_id,
  parent_alert_id,
  event_id,
  feature_vector_id,
  anomaly_score_id,
  title,
  description,
  severity,
  status,
  category,
  confidence,
  anomaly_score,
  model_id,
  inference_latency_ms,
  telemetry_source,
  alert_type,
  detector_type,
  detection_window_start,
  detection_window_end,
  net_destination_ip,
  net_destination_port,
  net_protocol,
  net_duration_ms,
  proc_name,
  proc_privilege_level,
  proc_pid,
  source_ip,
  mitre_technique_id,
  tags,
  organization_id,
  integrity_hash,
  created_at,
  updated_at,
  acknowledged_at,
  acknowledged_by,
  investigated_at,
  investigated_by,
  closed_at,
  closed_by,
  read,
  explanation_json
`.trim();

const METRICS_SELECT =
  'id,status,severity,anomaly_score,confidence,inference_latency_ms,created_at,closed_at';

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
  anomaliesResolved: number;
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
      const s = options.search.replace(/[%_]/g, '\\$&');
      query = query.or(
        `title.ilike.%${s}%,description.ilike.%${s}%,category.ilike.%${s}%`
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

    if (queryOptions.search) {
      return this.findAlertsWithSearchPaginated(options);
    }

    return this.findPaginated({
      page,
      limit,
      select: queryOptions.select ?? DEFAULT_ALERT_SELECT,
      filters,
      orderBy: queryOptions.orderBy,
      cacheTTL: queryOptions.cacheTTL
    });
  }

  private async findAlertsWithSearchPaginated(
    options: AlertQueryOptions & PaginationOptions
  ): Promise<PaginatedResult<Alert>> {
    const { page, limit, ...queryOptions } = options;
    const offset = (page - 1) * limit;

    let query = this.buildAlertQuery(queryOptions);
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

  async updateAlertStatus(id: string, status: AlertStatus, userId?: string): Promise<Alert> {
    try {
      const updates = buildStatusTransition(status, userId);
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq('id', id)
        .select(DEFAULT_ALERT_SELECT)
        .single();
      if (error) throw error;
      this.invalidateCache();
      return data as unknown as Alert;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async markAsRead(id: string): Promise<Alert> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({ read: true })
        .eq('id', id)
        .select(DEFAULT_ALERT_SELECT)
        .single();
      if (error) throw error;
      this.invalidateCache();
      return data as unknown as Alert;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async markMultipleAsRead(ids: string[]): Promise<void> {
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .update({ read: true })
        .in('id', ids);
      if (error) throw error;
      this.invalidateCache();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async bulkUpdateStatus(ids: string[], status: AlertStatus, userId?: string): Promise<Alert[]> {
    try {
      const updates = buildStatusTransition(status, userId);
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .in('id', ids)
        .select(DEFAULT_ALERT_SELECT);
      if (error) throw error;
      this.invalidateCache();
      return (data ?? []) as unknown as Alert[];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAlertMetrics(): Promise<AlertMetrics> {
    return this.cachedQuery(
      'alert_metrics',
      async () => {
        const alerts = await this.findAlerts({ select: METRICS_SELECT });
        const today = new Date().toDateString();

        const metrics: AlertMetrics = {
          total: alerts.length,
          pending: 0, acknowledged: 0, investigated: 0, closed: 0,
          critical: 0, high: 0, medium: 0, low: 0,
          avgAnomalyScore: 0, avgInferenceLatency: 0,
          anomaliesResolved: 0, resolvedToday: 0,
        };

        let scoreSum = 0, scoreCount = 0, latencySum = 0, latencyCount = 0;

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
          const score = a.anomaly_score ?? a.confidence ?? null;
          if (score !== null) { scoreSum += score; scoreCount++; }
          if ((a.inference_latency_ms ?? 0) > 0) { latencySum += a.inference_latency_ms; latencyCount++; }
          if (a.status === 'CLOSED' && (a.severity === 'critical' || a.severity === 'high')) metrics.anomaliesResolved++;
          if (a.status === 'CLOSED' && a.closed_at && new Date(a.closed_at).toDateString() === today) metrics.resolvedToday++;
        }

        if (scoreCount > 0) metrics.avgAnomalyScore = scoreSum / scoreCount;
        if (latencyCount > 0) metrics.avgInferenceLatency = latencySum / latencyCount;
        return metrics;
      },
      60 * 1000
    );
  }

  async findById(id: string): Promise<Alert | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select(DEFAULT_ALERT_SELECT)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw this.handleError(error);
      }

      return data as unknown as Alert;
    } catch (error) {
      throw this.handleError(error);
    }
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
        const alerts = await this.findAlerts({ startDate, endDate, select: 'created_at' });
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
    return this.cachedQuery(
      `top_categories_${limit}`,
      async () => {
        const alerts = await this.findAlerts({ select: 'category' });
        const counts = new Map<string, number>();
        for (const alert of alerts) {
          if (alert.category) counts.set(alert.category, (counts.get(alert.category) ?? 0) + 1);
        }
        return Array.from(counts.entries())
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);
      },
      10 * 60 * 1000
    );
  }

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
    case 'hour': return date.toISOString().slice(0, 13) + ':00';
    case 'week': {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return weekStart.toISOString().slice(0, 10);
    }
    default: return date.toISOString().slice(0, 10);
  }
}
