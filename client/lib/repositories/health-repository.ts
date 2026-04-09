import { BaseRepository } from '@/lib/repositories/base-repository';
import type { DeviceHealth, SystemHealth } from '@/lib/supabase/types';
import type { Database } from '@/lib/supabase/types/database';

type DeviceHealthSnapshot = Database['public']['Tables']['device_health_snapshots']['Row'];

interface DeviceRegistryJoin {
  name?: string;
  os?: string;
  agent_version?: string;
  is_active?: boolean;
  last_seen?: string;
}

export class HealthRepository extends BaseRepository<DeviceHealthSnapshot> {
  constructor() {
    super('device_health_snapshots');
  }

  async getDeviceHealth(options?: { limit?: number }): Promise<DeviceHealth[]> {
    const limit = options?.limit || 100;

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select(`
        *,
        device_registry:device_id (
          name,
          os,
          agent_version,
          is_active,
          last_seen
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw this.handleError(error);

    return (data || []).map(row => this.transformDeviceHealth(
      row as DeviceHealthSnapshot & { device_registry?: DeviceRegistryJoin | null }
    ));
  }

  async getDeviceById(deviceId: string): Promise<DeviceHealth | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select(`
        *,
        device_registry:device_id (
          name,
          os,
          agent_version,
          is_active,
          last_seen
        )
      `)
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw this.handleError(error);
    }

    return this.transformDeviceHealth(
      data as DeviceHealthSnapshot & { device_registry?: DeviceRegistryJoin | null }
    );
  }

  async getLatestHealthSnapshot(deviceId: string): Promise<DeviceHealth | null> {
    return this.getDeviceById(deviceId);
  }

  private transformDeviceHealth(
    snapshot: DeviceHealthSnapshot & { device_registry?: DeviceRegistryJoin | null }
  ): DeviceHealth {
    const reg = snapshot.device_registry;
    return {
      device_id: snapshot.device_id,
      hostname: reg?.name || 'Unknown',
      operating_system: reg?.os || 'Unknown',
      agent_version: reg?.agent_version || 'Unknown',
      last_seen_utc: reg?.last_seen || snapshot.created_at,
      is_active: reg?.is_active ?? false,
      status: snapshot.status as 'ONLINE' | 'OFFLINE' | 'WARNING' | 'ERROR',
      cpu_usage: Number(snapshot.cpu_usage) || 0,
      memory_usage: Number(snapshot.memory_usage) || 0,
      disk_usage: Number(snapshot.disk_usage) || 0,
      network_status: snapshot.network_status ?? false,
      alerts_last_24h: snapshot.alerts_last_24h || 0,
      uptime_percentage: Number(snapshot.uptime_percentage) || 0,
      response_time_ms: snapshot.response_time_ms || 0,
      error_count: snapshot.error_count || 0,
      warning_count: snapshot.warning_count || 0,
      last_restart: snapshot.last_restart || null,
    };
  }

  async getSystemHealth(): Promise<SystemHealth> {
    return this.cachedQuery(
      'system_health',
      async () => {
        const deviceHealth = await this.getDeviceHealth({ limit: 1000 });

        if (deviceHealth.length === 0) {
          return {
            total_devices: 0,
            online_devices: 0,
            offline_devices: 0,
            warning_devices: 0,
            error_devices: 0,
            avg_cpu_usage: 0,
            avg_memory_usage: 0,
            avg_disk_usage: 0,
            total_alerts: 0,
            total_alerts_24h: 0,
            critical_alerts_24h: 0,
            system_uptime: 0,
            api_response_time: 0,
            system_status: 'HEALTHY' as const,
            last_updated: new Date().toISOString(),
          };
        }

        const onlineCount = deviceHealth.filter(d => d.status === 'ONLINE').length;
        const offlineCount = deviceHealth.filter(d => d.status === 'OFFLINE').length;
        const warningCount = deviceHealth.filter(d => d.status === 'WARNING').length;
        const errorCount = deviceHealth.filter(d => d.status === 'ERROR').length;

        const totalCpu = deviceHealth.reduce((sum, d) => sum + d.cpu_usage, 0);
        const totalMemory = deviceHealth.reduce((sum, d) => sum + d.memory_usage, 0);
        const totalDisk = deviceHealth.reduce((sum, d) => sum + d.disk_usage, 0);
        const totalAlerts = deviceHealth.reduce((sum, d) => sum + d.alerts_last_24h, 0);

        const n = deviceHealth.length;
        const avgCpu = totalCpu / n;
        const avgMemory = totalMemory / n;
        const avgDisk = totalDisk / n;

        let systemStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
        if (errorCount > 0) systemStatus = 'CRITICAL';
        else if (warningCount > 0 || avgCpu > 80 || avgMemory > 80 || avgDisk > 80) systemStatus = 'WARNING';

        return {
          total_devices: n,
          online_devices: onlineCount,
          offline_devices: offlineCount,
          warning_devices: warningCount,
          error_devices: errorCount,
          avg_cpu_usage: avgCpu,
          avg_memory_usage: avgMemory,
          avg_disk_usage: avgDisk,
          total_alerts: totalAlerts,
          total_alerts_24h: totalAlerts,
          critical_alerts_24h: 0,
          system_uptime: 0,
          api_response_time: 0,
          system_status: systemStatus,
          last_updated: new Date().toISOString(),
        };
      },
      30 * 1000
    );
  }
}