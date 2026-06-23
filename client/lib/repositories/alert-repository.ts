import { escapeWildcards } from "@/lib/repositories/query-utils";
import type {
  Alert,
  AlertStatus,
  AlertQueryOptions,
  AlertMetrics,
  AlertSubscriptionCallbacks,
} from "@/lib/types/alerts";
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

const ACTIVE_STATUSES: AlertStatus[] = [
  "PENDING",
  "ACKNOWLEDGED",
  "INVESTIGATED",
];

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

export class AlertRepository {
  private channels: Map<string, RealtimeChannel> = new Map();

  constructor(private readonly supabaseClient: SupabaseClient) {}

  private buildAlertQuery(options: AlertQueryOptions) {
    let query = this.supabaseClient
      .from("alerts")
      .select(options.select ?? DEFAULT_ALERT_SELECT);

    if (options.deviceId) query = query.eq("device_id", options.deviceId);
    if (options.status) {
      if (Array.isArray(options.status)) {
        query = query.in("status", options.status);
      } else {
        query = query.eq("status", options.status);
      }
    }
    if (options.severity) {
      if (Array.isArray(options.severity)) {
        query = query.in("severity", options.severity);
      } else {
        query = query.eq("severity", options.severity);
      }
    }
    if (options.category) query = query.eq("category", options.category);
    if (options.unreadOnly) query = query.eq("read", false);
    if (options.startDate) query = query.gte("created_at", options.startDate);
    if (options.endDate) query = query.lte("created_at", options.endDate);
    if (options.minAnomalyScore !== undefined)
      query = query.gte("anomaly_score", options.minAnomalyScore);
    if (options.maxAnomalyScore !== undefined)
      query = query.lte("anomaly_score", options.maxAnomalyScore);
    if (options.offset !== undefined && options.limit)
      query = query.range(options.offset, options.offset + options.limit - 1);

    if (options.search) {
      const s = escapeWildcards(options.search);
      query = query.or(
        `title.ilike.%${s}%,description.ilike.%${s}%,category.ilike.%${s}%`,
      );
    }

    if (options.orderBy)
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending,
      });
    if (options.limit) query = query.limit(options.limit);

    return query;
  }

  public async findAlerts(
    options: AlertQueryOptions = {},
  ): Promise<{ data: Alert[]; error: Error | null }> {
    try {
      const { data, error } = await this.buildAlertQuery(options);
      if (error) throw error;
      return { data: (data ?? []) as unknown as Alert[], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find alerts"),
      };
    }
  }

  public async findAlertsPaginated(
    options: AlertQueryOptions & { page: number; limit: number },
  ): Promise<{
    data: Alert[];
    count: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    error: Error | null;
  }> {
    try {
      const { page, limit: pageSize, ...queryOptions } = options;
      const offset = (page - 1) * pageSize;

      const dataQuery = this.buildAlertQuery({
        ...queryOptions,
        offset,
        limit: pageSize,
      });

      let countQuery = this.supabaseClient
        .from("alerts")
        .select("*", { count: "exact", head: true });
      if (queryOptions.deviceId)
        countQuery = countQuery.eq("device_id", queryOptions.deviceId);
      if (queryOptions.status) {
        if (Array.isArray(queryOptions.status)) {
          countQuery = countQuery.in("status", queryOptions.status);
        } else {
          countQuery = countQuery.eq("status", queryOptions.status);
        }
      }
      if (queryOptions.severity) {
        if (Array.isArray(queryOptions.severity)) {
          countQuery = countQuery.in("severity", queryOptions.severity);
        } else {
          countQuery = countQuery.eq("severity", queryOptions.severity);
        }
      }
      if (queryOptions.category)
        countQuery = countQuery.eq("category", queryOptions.category);
      if (queryOptions.unreadOnly) countQuery = countQuery.eq("read", false);
      if (queryOptions.startDate)
        countQuery = countQuery.gte("created_at", queryOptions.startDate);
      if (queryOptions.endDate)
        countQuery = countQuery.lte("created_at", queryOptions.endDate);
      if (queryOptions.minAnomalyScore !== undefined)
        countQuery = countQuery.gte(
          "anomaly_score",
          queryOptions.minAnomalyScore,
        );
      if (queryOptions.maxAnomalyScore !== undefined)
        countQuery = countQuery.lte(
          "anomaly_score",
          queryOptions.maxAnomalyScore,
        );
      if (queryOptions.search) {
        const s = escapeWildcards(queryOptions.search);
        countQuery = countQuery.or(
          `title.ilike.%${s}%,description.ilike.%${s}%,category.ilike.%${s}%`,
        );
      }

      const [{ data, error: dataError }, { count, error: countError }] =
        await Promise.all([dataQuery, countQuery]);
      if (dataError) throw dataError;
      if (countError) throw countError;

      const totalPages = Math.ceil((count ?? 0) / pageSize);

      return {
        data: (data ?? []) as unknown as Alert[],
        count: count ?? 0,
        page,
        limit: pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        error: null,
      };
    } catch (error) {
      return {
        data: [],
        count: 0,
        page: 0,
        limit: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find paginated alerts"),
      };
    }
  }

  public async getCriticalAlerts(): Promise<{ data: Alert[]; error: Error | null }> {
    return this.findAlerts({
      severity: "critical",
      status: ACTIVE_STATUSES,
      orderBy: { column: "created_at", ascending: false },
    });
  }

  public async updateAlertStatus(
    id: string,
    status: AlertStatus,
    userId?: string,
  ): Promise<{ data: Alert | null; error: Error | null }> {
    try {
      const updates = buildStatusTransition(status, userId);
      const { data, error } = await this.supabaseClient
        .from("alerts")
        .update(updates)
        .eq("id", id)
        .select(DEFAULT_ALERT_SELECT)
        .single();
      if (error) throw error;
      return { data: data as unknown as Alert, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to update alert status"),
      };
    }
  }

  public async markAsRead(
    id: string,
  ): Promise<{ data: Alert | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .from("alerts")
        .update({ read: true })
        .eq("id", id)
        .select(DEFAULT_ALERT_SELECT)
        .single();
      if (error) throw error;
      return { data: data as unknown as Alert, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to mark alert as read"),
      };
    }
  }

  public async markMultipleAsRead(
    ids: string[],
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabaseClient
        .from("alerts")
        .update({ read: true })
        .in("id", ids);
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error
            : new Error("Failed to mark alerts as read"),
      };
    }
  }

  public async bulkUpdateStatus(
    ids: string[],
    status: AlertStatus,
    userId?: string,
  ): Promise<{ data: Alert[]; error: Error | null }> {
    try {
      const updates = buildStatusTransition(status, userId);
      const { data, error } = await this.supabaseClient
        .from("alerts")
        .update(updates)
        .in("id", ids)
        .select(DEFAULT_ALERT_SELECT);
      if (error) throw error;
      return { data: (data ?? []) as unknown as Alert[], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to bulk update status"),
      };
    }
  }

  public async getAlertMetrics(): Promise<{
    data: AlertMetrics | null;
    error: Error | null;
  }> {
    try {
      const today = new Date();
      const todayStart = today.toISOString().slice(0, 10);

      const countResults = await Promise.all([
        this.supabaseClient
          .from("alerts")
          .select("*", { count: "exact", head: true }),
        this.supabaseClient
          .from("alerts")
          .select("*", { count: "exact", head: true })
          .eq("status", "PENDING"),
        this.supabaseClient
          .from("alerts")
          .select("*", { count: "exact", head: true })
          .eq("status", "ACKNOWLEDGED"),
        this.supabaseClient
          .from("alerts")
          .select("*", { count: "exact", head: true })
          .eq("status", "INVESTIGATED"),
        this.supabaseClient
          .from("alerts")
          .select("*", { count: "exact", head: true })
          .eq("status", "CLOSED"),
        this.supabaseClient
          .from("alerts")
          .select("*", { count: "exact", head: true })
          .eq("severity", "critical"),
        this.supabaseClient
          .from("alerts")
          .select("*", { count: "exact", head: true })
          .eq("severity", "high"),
        this.supabaseClient
          .from("alerts")
          .select("*", { count: "exact", head: true })
          .eq("severity", "medium"),
        this.supabaseClient
          .from("alerts")
          .select("*", { count: "exact", head: true })
          .eq("severity", "low"),
        this.supabaseClient
          .from("alerts")
          .select("*", { count: "exact", head: true })
          .eq("status", "CLOSED")
          .in("severity", ["critical", "high"]),
        this.supabaseClient
          .from("alerts")
          .select("*", { count: "exact", head: true })
          .eq("status", "CLOSED")
          .gte("closed_at", todayStart),
      ]);

      for (const result of countResults) {
        if (result.error) throw result.error;
      }

      const { data: avgData, error: avgError } = await this.supabaseClient
        .from("alerts")
        .select("anomaly_score,confidence,inference_latency_ms")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (avgError) throw avgError;

      let scoreSum = 0,
        scoreCount = 0,
        latencySum = 0,
        latencyCount = 0;

      for (const a of avgData ?? []) {
        const score =
          (a as unknown as Record<string, unknown>).anomaly_score ??
          (a as unknown as Record<string, unknown>).confidence ??
          null;
        if (score !== null && typeof score === "number") {
          scoreSum += score;
          scoreCount++;
        }
        const lat = (a as unknown as Record<string, unknown>)
          .inference_latency_ms;
        if (typeof lat === "number" && lat > 0) {
          latencySum += lat;
          latencyCount++;
        }
      }

      const [
        { count: total },
        { count: pending },
        { count: acknowledged },
        { count: investigated },
        { count: closed },
        { count: critical },
        { count: high },
        { count: medium },
        { count: low },
        { count: anomaliesResolved },
        { count: resolvedToday },
      ] = countResults;

      return {
        data: {
          total: total ?? 0,
          pending: pending ?? 0,
          acknowledged: acknowledged ?? 0,
          investigated: investigated ?? 0,
          closed: closed ?? 0,
          critical: critical ?? 0,
          high: high ?? 0,
          medium: medium ?? 0,
          low: low ?? 0,
          avgAnomalyScore: scoreCount > 0 ? scoreSum / scoreCount : 0,
          avgInferenceLatency:
            latencyCount > 0 ? latencySum / latencyCount : 0,
          anomaliesResolved: anomaliesResolved ?? 0,
          resolvedToday: resolvedToday ?? 0,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get alert metrics"),
      };
    }
  }

  public async findById(
    id: string,
  ): Promise<{ data: Alert | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .from("alerts")
        .select(DEFAULT_ALERT_SELECT)
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") return { data: null, error: null };
        throw error;
      }

      return { data: data as unknown as Alert, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find alert by ID"),
      };
    }
  }

  public async countWhere(): Promise<{ data: number; error: Error | null }> {
    try {
      const { count, error } = await this.supabaseClient
        .from("alerts")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return { data: count ?? 0, error: null };
    } catch (error) {
      return {
        data: 0,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to count alerts"),
      };
    }
  }

  public subscribeToAlerts(
    filters: Record<string, unknown> = {},
    callbacks: AlertSubscriptionCallbacks = {},
  ): string {
    const channelName = "realtime-alerts";

    const existing = this.channels.get(channelName);
    if (existing) {
      this.supabaseClient.removeChannel(existing);
      this.channels.delete(channelName);
    }

    const channel = this.supabaseClient.channel(channelName);
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "alerts", ...filters },
      (payload) => {
        try {
          const p = payload as {
            eventType: string;
            new: Record<string, unknown>;
            old: Record<string, unknown>;
          };
          switch (p.eventType) {
            case "INSERT":
              callbacks.onInsert?.(p.new as unknown as Alert);
              break;
            case "UPDATE":
              callbacks.onUpdate?.(p.new as unknown as Alert);
              break;
            case "DELETE":
              callbacks.onDelete?.(p.old as unknown as Alert);
              break;
          }
        } catch (error) {
          callbacks.onError?.(error);
        }
      },
    );
    channel.subscribe();
    this.channels.set(channelName, channel);

    return channelName;
  }

  public unsubscribeFromAlerts(channelName?: string): void {
    const name = channelName ?? "realtime-alerts";
    const channel = this.channels.get(name);
    if (channel) {
      this.supabaseClient.removeChannel(channel);
      this.channels.delete(name);
    }
  }
}

 function buildStatusTransition(
  status: AlertStatus,
  userId?: string,
): Partial<Alert> {
  const now = new Date().toISOString();
  const updates: Partial<Alert> = { status };
  switch (status) {
    case "ACKNOWLEDGED":
      updates.acknowledged_at = now;
      if (userId) updates.acknowledged_by = userId;
      break;
    case "INVESTIGATED":
      updates.investigated_at = now;
      if (userId) updates.investigated_by = userId;
      break;
    case "CLOSED":
      updates.closed_at = now;
      if (userId) updates.closed_by = userId;
      break;
  }
  return updates;
}
