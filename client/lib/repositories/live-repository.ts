import {
  BaseRepository,
  type QueryOptions,
} from '@/lib/repositories/base-repository';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Alert, TelemetryEvent } from '@/lib/supabase/types';

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
  updated_at,
  acknowledged_at,
  acknowledged_by,
  investigated_at,
  investigated_by,
  closed_at,
  closed_by,
  read
`.trim();

const DEFAULT_TELEMETRY_SELECT = `
  id,
  device_id,
  collected_at,
  received_at,
  source,
  payload,
  collection_agent_version,
  connectivity_state,
  payload_hash,
  created_at
`.trim();

export interface LiveQueryOptions extends QueryOptions {
  startDate?: string;
  endDate?: string;
}

export interface LiveSubscriptionCallbacks {
  onNewAlert?: (alert: Alert) => void;
  onNewTelemetry?: (telemetry: TelemetryEvent) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (connected: boolean) => void;
}

export interface LiveStats {
  total: number;
  critical: number;
  blocked: number;
}

export class LiveRepository extends BaseRepository<Alert | TelemetryEvent> {
  private alertChannel: RealtimeChannel | null = null;
  private telemetryChannel: RealtimeChannel | null = null;

  constructor() {
    super('alert_records');
  }

  async getRecentAlerts(options: LiveQueryOptions = {}): Promise<Alert[]> {
    const queryOptions: QueryOptions = {
      select: DEFAULT_ALERT_SELECT,
      orderBy: { column: 'created_at', ascending: false },
      limit: 50,
      ...options,
    };

    if (options.startDate) {
      queryOptions.filters = {
        ...queryOptions.filters,
        created_at: { gte: options.startDate },
      };
    }

    if (options.endDate) {
      queryOptions.filters = {
        ...queryOptions.filters,
        created_at: { lte: options.endDate },
      };
    }

    const alerts = await this.findMany(queryOptions) as unknown;
    const alertRecords = (alerts as Array<{ alert_id: string } & Record<string, unknown>>)
      .filter((item) => item && typeof item === 'object' && 'alert_id' in item);

    return alertRecords.map((alert) => ({
      ...alert,
      id: alert.alert_id,
    })) as Alert[];
  }

  async getTodayStats(): Promise<LiveStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: alerts } = await this.supabase
      .from('alert_records')
      .select('severity, status, created_at')
      .gte('created_at', today.toISOString());

    if (!alerts) {
      return { total: 0, critical: 0, blocked: 0 };
    }

    const total = alerts.length;
    const critical = alerts.filter((alert: { severity: string; status: string }) => alert.severity === 'critical').length;
    const blocked = alerts.filter((alert: { severity: string; status: string }) => alert.status === 'CLOSED').length;

    return { total, critical, blocked };
  }

  async getRecentTelemetry(options: LiveQueryOptions = {}): Promise<TelemetryEvent[]> {
    const queryOptions: QueryOptions = {
      select: DEFAULT_TELEMETRY_SELECT,
      orderBy: { column: 'collected_at', ascending: false },
      limit: 50,
      ...options,
    };

    if (options.startDate) {
      queryOptions.filters = {
        ...queryOptions.filters,
        collected_at: { gte: options.startDate },
      };
    }

    if (options.endDate) {
      queryOptions.filters = {
        ...queryOptions.filters,
        collected_at: { lte: options.endDate },
      };
    }

    this.tableName = 'telemetry_events';
    const result = await this.findMany(queryOptions) as TelemetryEvent[];
    this.tableName = 'alert_records';

    return result;
  }

  subscribeToLiveFeed(callbacks: LiveSubscriptionCallbacks = {}): () => void {
    const { onNewAlert, onNewTelemetry, onError, onStatusChange } = callbacks;

    // Subscribe to alerts
    const alertChannelName = 'live-feed-alerts';
    const alertChannel = this.supabase
      .channel(alertChannelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alert_records' },
        (payload) => {
          try {
            if (payload.new) {
              // Normalize alert_id to id for Alert interface compatibility
              const normalizedAlert = {
                ...payload.new,
                id: payload.new.alert_id,
              } as Alert;
              onNewAlert?.(normalizedAlert);
            }
          } catch (error) {
            onError?.(error instanceof Error ? error : new Error('Unknown error in alert subscription'));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CLOSED') {
          onStatusChange?.(status === 'SUBSCRIBED');
        }
      });

    // Subscribe to telemetry
    const telemetryChannelName = 'live-feed-telemetry';
    const telemetryChannel = this.supabase
      .channel(telemetryChannelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'telemetry_events' },
        (payload) => {
          try {
            if (payload.new) {
              onNewTelemetry?.(payload.new as TelemetryEvent);
            }
          } catch (error) {
            onError?.(error instanceof Error ? error : new Error('Unknown error in telemetry subscription'));
          }
        }
      )
      .subscribe();

    this.alertChannel = alertChannel;
    this.telemetryChannel = telemetryChannel;

    // Return cleanup function
    return () => {
      this.supabase.removeChannel(alertChannel);
      this.supabase.removeChannel(telemetryChannel);
      this.alertChannel = null;
      this.telemetryChannel = null;
    };
  }

  unsubscribeFromLiveFeed(): void {
    if (this.alertChannel) {
      this.supabase.removeChannel(this.alertChannel);
      this.alertChannel = null;
    }
    if (this.telemetryChannel) {
      this.supabase.removeChannel(this.telemetryChannel);
      this.telemetryChannel = null;
    }
  }

  isSubscribed(): boolean {
    return !!(this.alertChannel && this.telemetryChannel);
  }
}
