import { BaseRepository } from '@/lib/repositories/base-repository';
import type { DeviceHealthSnapshot, SystemHealth } from '@/lib/supabase/types';
import type { DeviceHealthRow } from '@/lib/supabase/types/database';

export class HealthRepository extends BaseRepository<DeviceHealthRow> {
  constructor() {
    super('device_health');
    this.schema = 'telemetry';
  }

  async getDeviceHealth(options?: { limit?: number; organizationId?: string }): Promise<DeviceHealthSnapshot[]> {
    const limit = options?.limit || 100;

    let query = this.getClient()
      .from(this.tableName)
      .select(`
        *,
        devices:device_id (
          name,
          os,
          agent_version,
          is_active,
          last_seen
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (options?.organizationId) {
      query = query.eq('organization_id', options.organizationId);
    }

    const { data, error } = await query;

    if (error) throw this.handleError(error);

    const seenDevices = new Set<string>();
    const uniqueRows = (data || []).filter((row: unknown) => {
      const snapshot = row as DeviceHealthRow;
      if (seenDevices.has(snapshot.device_id)) {
        return false;
      }
      seenDevices.add(snapshot.device_id);
      return true;
    });

    return uniqueRows.map(row => this.transformDeviceHealth(
      row as DeviceHealthRow & { devices?: { name?: string; os?: string; agent_version?: string; is_active?: boolean; last_seen?: string } | null }
    ));
  }

  async getDeviceById(deviceId: string): Promise<DeviceHealthSnapshot | null> {
    const { data, error } = await this.getClient()
      .from(this.tableName)
      .select(`
        *,
        devices:device_id (
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
      data as DeviceHealthRow & { devices?: { name?: string; os?: string; agent_version?: string; is_active?: boolean; last_seen?: string } | null }
    );
  }

  async getLatestHealthSnapshot(deviceId: string): Promise<DeviceHealthSnapshot | null> {
    return this.getDeviceById(deviceId);
  }

  private transformDeviceHealth(
    snapshot: DeviceHealthRow & { devices?: { name?: string; os?: string; agent_version?: string; is_active?: boolean; last_seen?: string } | null }
  ): DeviceHealthSnapshot {
    const dev = snapshot.devices;
    return {
      id: snapshot.id,
      device_id: snapshot.device_id,
      status: snapshot.status,
      cpu_usage: Number(snapshot.cpu_usage) || null,
      memory_usage: Number(snapshot.memory_usage) || null,
      disk_usage: Number(snapshot.disk_usage) || null,
      network_status: snapshot.network_status,
      alerts_last_24h: snapshot.alerts_last_24h,
      uptime_percentage: Number(snapshot.uptime_percentage) || null,
      response_time_ms: snapshot.response_time_ms,
      error_count: snapshot.error_count,
      warning_count: snapshot.warning_count,
      last_restart: snapshot.last_restart,
      organization_id: snapshot.organization_id,
      created_at: snapshot.created_at,
      integrity_hash: snapshot.integrity_hash,
    };
  }

  async getSystemHealth(organizationId?: string): Promise<SystemHealth> {
    const cacheKey = `system_health_${organizationId || 'all'}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const deviceHealth = await this.getDeviceHealth({ limit: 1000, organizationId });

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

        const totalCpu = deviceHealth.reduce((sum, d) => sum + (d.cpu_usage ?? 0), 0);
        const totalMemory = deviceHealth.reduce((sum, d) => sum + (d.memory_usage ?? 0), 0);
        const totalDisk = deviceHealth.reduce((sum, d) => sum + (d.disk_usage ?? 0), 0);
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
