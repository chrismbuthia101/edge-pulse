import {
  BaseRepository,
} from '@/lib/repositories/base-repository';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Alert, TelemetryEvent } from '@/lib/supabase/types';

export interface LiveQueryOptions {
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

export class LiveRepository extends BaseRepository {
  private alertChannel: RealtimeChannel | null = null;
  private telemetryChannel: RealtimeChannel | null = null;

  constructor() {
    super('alerts');
  }

  async getRecentAlerts(options: LiveQueryOptions = {}): Promise<Alert[]> {
    let query = this.supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (options.startDate) query = query.gte('created_at', options.startDate);
    if (options.endDate) query = query.lte('created_at', options.endDate);

    const { data, error } = await query;
    if (error) throw this.handleError(error);
    return (data ?? []) as unknown as Alert[];
  }

  async getTodayStats(): Promise<LiveStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: alerts } = await this.supabase
      .from('alerts')
      .select('severity, status, created_at')
      .gte('created_at', today.toISOString());

    if (!alerts) {
      return { total: 0, critical: 0, blocked: 0 };
    }

    const total = alerts.length;
    const critical = alerts.filter((a: { severity: string }) => a.severity === 'critical').length;
    const blocked = alerts.filter((a: { status: string }) => a.status === 'CLOSED').length;

    return { total, critical, blocked };
  }

  async getRecentTelemetry(options: LiveQueryOptions = {}): Promise<TelemetryEvent[]> {
    let query = this.supabase
      .schema('telemetry')
      .from('events')
      .select('*')
      .order('collected_at', { ascending: false })
      .limit(50);

    if (options.startDate) query = query.gte('collected_at', options.startDate);
    if (options.endDate) query = query.lte('collected_at', options.endDate);

    const { data, error } = await query;
    if (error) throw this.handleError(error);

    if (!data || !Array.isArray(data)) {
      return [];
    }

    const telemetryData = data as unknown as TelemetryEvent[];
    const deviceIds = [...new Set(telemetryData.map((t) => t.device_id))];

    const { data: devices } = await this.supabase
      .from('devices')
      .select('id, name')
      .in('id', deviceIds);

    const deviceMap = new Map(
      (devices ?? []).map((d: { id: string; name: string }) => [d.id, d.name])
    );

    return telemetryData.map((telemetry) => ({
      ...telemetry,
      device_name: deviceMap.get(telemetry.device_id),
    })) as unknown as TelemetryEvent[];
  }

  subscribeToLiveFeed(callbacks: LiveSubscriptionCallbacks = {}): () => void {
    const { onNewAlert, onNewTelemetry, onError, onStatusChange } = callbacks;

    const alertChannelName = 'live-feed-alerts';
    const alertChannel = this.supabase
      .channel(alertChannelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts' },
        (payload) => {
          try {
            if (payload.new) {
              onNewAlert?.(payload.new as Alert);
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

    const telemetryChannelName = 'live-feed-telemetry';
    const telemetryChannel = this.supabase
      .channel(telemetryChannelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'telemetry', table: 'events' },
        async (payload) => {
          try {
            if (payload.new) {
              const { data: device } = await this.supabase
                .from('devices')
                .select('name')
                .eq('id', payload.new.device_id)
                .single();

              const telemetryWithDeviceName = {
                ...payload.new,
                device_name: device?.name,
              } as unknown as TelemetryEvent;

              onNewTelemetry?.(telemetryWithDeviceName);
            }
          } catch (error) {
            onError?.(error instanceof Error ? error : new Error('Unknown error in telemetry subscription'));
          }
        }
      )
      .subscribe();

    this.alertChannel = alertChannel;
    this.telemetryChannel = telemetryChannel;

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
