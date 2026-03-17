import { BaseRepository, type QueryOptions, type PaginatedResult, type PaginationOptions } from '@/lib/repositories/base-repository';
import type { Device, DeviceStatus, RealtimeDevicePayload } from '@/lib/supabase/types';

// ─── Constants ────────────────────────────────────────────────────────────────
const LATEST_AGENT_VERSION = 'v2.4.1';

/** Performance / health thresholds */
const THRESHOLDS = {
  cpuWarning: 80,
  cpuCritical: 90,
  ramWarning: 80,
  ramCritical: 90,
  syncQueueWarning: 10,
  syncQueueCritical: 20,
} as const;

/**
 * Default fields selected for list queries — intentionally excludes heavy
 * columns (e.g. raw log blobs) that are only needed on a detail view.
 */
const DEFAULT_DEVICE_SELECT = `
  id,
  name,
  type,
  status,
  risk,
  alerts_count,
  os,
  last_seen,
  ip,
  agent_version,
  cpu_percent,
  ram_percent,
  sync_queue_depth,
  hash_chain_ok,
  actively_reporting
`.trim();

/** Minimal projection for aggregation / metrics queries. */
const METRICS_SELECT =
  'status,type,risk,cpu_percent,ram_percent,alerts_count,sync_queue_depth,hash_chain_ok,agent_version';

/** Minimal projection for attention / performance queries. */
const TRIAGE_SELECT =
  'id,name,status,risk,cpu_percent,ram_percent,sync_queue_depth,hash_chain_ok';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DeviceQueryOptions extends QueryOptions {
  status?: DeviceStatus | DeviceStatus[];
  type?: string | string[];
  risk?: string | string[];
  /** Full-text search across name, IP, OS, and type — pushed to server via ilike. */
  search?: string;
  onlineOnly?: boolean;
  minCpuUsage?: number;
  maxCpuUsage?: number;
  minRamUsage?: number;
  maxRamUsage?: number;
  agentVersion?: string;
  osType?: string;
}

export interface DeviceMetrics {
  total: number;
  online: number;
  offline: number;
  isolated: number;
  gone_silent: number;
  unsynced: number;
  byType: Record<string, number>;
  byRisk: Record<string, number>;
  avgCpuUsage: number;
  avgRamUsage: number;
  totalAlerts: number;
  criticalDevices: number;
  highRiskDevices: number;
  outdatedAgents: number;
  brokenHashChains: number;
  totalSyncQueueDepth: number;
}

export interface DeviceSubscriptionCallbacks {
  onInsert?: (device: Device) => void;
  onUpdate?: (device: Device) => void;
  onDelete?: (device: Device) => void;
  onError?: (error: unknown) => void;
}

export interface DeviceHealthStatus {
  deviceId: string;
  deviceName: string;
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  lastSeen: string;
  syncQueueDepth: number;
  hashChainOk: boolean;
  agentVersion: string;
  recommendations: string[];
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class DeviceRepository extends BaseRepository<Device> {
  constructor() {
    super('devices');
  }

  // ── Query builder ──────────────────────────────────────────────────────────

  private buildDeviceQuery(options: DeviceQueryOptions) {
    const standardFilters: Record<string, unknown> = {};

    if (options.onlineOnly) {
      // onlineOnly supersedes any explicit status filter
      standardFilters.status = ['online', 'gone_silent', 'unsynced'];
    } else if (options.status) {
      standardFilters.status = options.status;
    }

    if (options.type) standardFilters.type = options.type;
    if (options.risk) standardFilters.risk = options.risk;
    if (options.agentVersion) standardFilters.agent_version = options.agentVersion;

    // Start with the base query builder (handles eq/in filters, orderBy, limit, offset)
    let query = this.buildQuery({
      select: options.select ?? DEFAULT_DEVICE_SELECT,
      filters: standardFilters,
      orderBy: options.orderBy,
      limit: options.limit,
      offset: options.offset,
    });

    // Push search to the server with ilike across all relevant text columns
    if (options.search) {
      const s = options.search.replace(/[%_]/g, '\\$&'); // escape wildcards
      query = query.or(
        `name.ilike.%${s}%,ip.ilike.%${s}%,os.ilike.%${s}%,type.ilike.%${s}%`
      );
    }

    // Push numeric range filters to the server
    if (options.minCpuUsage !== undefined) query = query.gte('cpu_percent', options.minCpuUsage);
    if (options.maxCpuUsage !== undefined) query = query.lte('cpu_percent', options.maxCpuUsage);
    if (options.minRamUsage !== undefined) query = query.gte('ram_percent', options.minRamUsage);
    if (options.maxRamUsage !== undefined) query = query.lte('ram_percent', options.maxRamUsage);

    // Push OS type filter to the server
    if (options.osType) {
      const os = options.osType.replace(/[%_]/g, '\\$&');
      query = query.ilike('os', `%${os}%`);
    }

    return query;
  }

  // ── Read operations ────────────────────────────────────────────────────────

  async findDevices(options: DeviceQueryOptions = {}): Promise<Device[]> {
    const cacheKey = options.cacheKey ?? `devices_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildDeviceQuery(options);
        if (error) throw error;
        return (data as unknown) as Device[];
      },
      options.cacheTTL
    );
  }

  async findDevicesPaginated(
    options: DeviceQueryOptions & PaginationOptions
  ): Promise<PaginatedResult<Device>> {
    const { page, limit, ...queryOptions } = options;
    const offset = (page - 1) * limit;

    // Count without device-specific filters so we get the total filtered count
    const { count, error: countError } = await this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true });

    if (countError) throw this.handleError(countError);

    const data = await this.findDevices({ ...queryOptions, limit, offset });
    const totalPages = Math.ceil((count ?? 0) / limit);

    return {
      data,
      count: count ?? 0,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  async getOnlineDevices(): Promise<Device[]> {
    return this.findDevices({
      status: 'online',
      orderBy: { column: 'name', ascending: true },
      cacheTTL: 30 * 1000,
    });
  }

  async getDevicesByStatus(status: DeviceStatus): Promise<Device[]> {
    return this.findDevices({
      status,
      orderBy: { column: 'last_seen', ascending: false },
      cacheTTL: 60 * 1000,
    });
  }

  async getDevicesByRisk(risk: string): Promise<Device[]> {
    return this.findDevices({
      risk,
      orderBy: { column: 'last_seen', ascending: false },
      cacheTTL: 60 * 1000,
    });
  }

  async getCriticalDevices(): Promise<Device[]> {
    return this.findDevices({
      risk: ['critical', 'high'],
      orderBy: { column: 'risk', ascending: false },
      cacheTTL: 30 * 1000,
    });
  }

  async getDevicesWithPerformanceIssues(): Promise<Device[]> {
    const devices = await this.findDevices({
      onlineOnly: true,
      select: TRIAGE_SELECT,
      cacheTTL: 60 * 1000,
    });

    return devices.filter(
      (d) =>
        (d.cpu_percent ?? 0) > THRESHOLDS.cpuWarning ||
        (d.ram_percent ?? 0) > THRESHOLDS.ramWarning ||
        (d.sync_queue_depth ?? 0) > THRESHOLDS.syncQueueWarning
    );
  }

  async getDevicesNeedingAttention(): Promise<Device[]> {
    const devices = await this.findDevices({
      select: TRIAGE_SELECT,
      cacheTTL: 30 * 1000,
    });

    return devices.filter(
      (d) =>
        d.risk === 'critical' ||
        d.status === 'offline' ||
        d.status === 'gone_silent' ||
        (d.sync_queue_depth ?? 0) > THRESHOLDS.syncQueueWarning ||
        d.hash_chain_ok === false ||
        (d.cpu_percent ?? 0) > THRESHOLDS.cpuCritical ||
        (d.ram_percent ?? 0) > THRESHOLDS.ramCritical
    );
  }

  async searchDevices(query: string, options: DeviceQueryOptions = {}): Promise<Device[]> {
    return this.findDevices({ ...options, search: query });
  }

  async getDevicesByOS(osPattern: string): Promise<Device[]> {
    return this.findDevices({
      osType: osPattern,
      orderBy: { column: 'name', ascending: true },
      cacheTTL: 5 * 60 * 1000,
    });
  }

  // ── Write operations ───────────────────────────────────────────────────────

  async updateDeviceStatus(id: string, status: DeviceStatus): Promise<Device> {
    return this.update(id, { status });
  }

  async updateDeviceMetrics(
    id: string,
    metrics: {
      cpuPercent?: number;
      ramPercent?: number;
      syncQueueDepth?: number;
      hashChainOk?: boolean;
      activelyReporting?: boolean;
    }
  ): Promise<Device> {
    const updates: Partial<Device> = {};

    if (metrics.cpuPercent !== undefined) updates.cpu_percent = metrics.cpuPercent;
    if (metrics.ramPercent !== undefined) updates.ram_percent = metrics.ramPercent;
    if (metrics.syncQueueDepth !== undefined) updates.sync_queue_depth = metrics.syncQueueDepth;
    if (metrics.hashChainOk !== undefined) updates.hash_chain_ok = metrics.hashChainOk;
    if (metrics.activelyReporting !== undefined) updates.actively_reporting = metrics.activelyReporting;

    return this.update(id, updates);
  }

  async isolateDevice(id: string): Promise<Device> {
    return this.update(id, { status: 'isolated' as DeviceStatus });
  }

  async unisolateDevice(id: string): Promise<Device> {
    return this.update(id, { status: 'online' as DeviceStatus });
  }

  async bulkUpdateStatus(ids: string[], status: DeviceStatus): Promise<Device[]> {
    return this.updateMany({ id: ids }, { status });
  }

  // ── Aggregations ───────────────────────────────────────────────────────────

  async getDeviceMetrics(): Promise<DeviceMetrics> {
    return this.cachedQuery(
      'device_metrics',
      async () => {
        const devices = await this.findDevices({ select: METRICS_SELECT });

        // Single-pass accumulation — avoids iterating `devices` 10+ times.
        const metrics: DeviceMetrics = {
          total: devices.length,
          online: 0,
          offline: 0,
          isolated: 0,
          gone_silent: 0,
          unsynced: 0,
          byType: {},
          byRisk: {},
          avgCpuUsage: 0,
          avgRamUsage: 0,
          totalAlerts: 0,
          criticalDevices: 0,
          highRiskDevices: 0,
          outdatedAgents: 0,
          brokenHashChains: 0,
          totalSyncQueueDepth: 0,
        };

        let onlineCount = 0;
        let totalCpu = 0;
        let totalRam = 0;

        for (const d of devices) {
          // Status counters
          switch (d.status) {
            case 'online':       metrics.online++;       onlineCount++; totalCpu += d.cpu_percent ?? 0; totalRam += d.ram_percent ?? 0; break;
            case 'offline':      metrics.offline++;      break;
            case 'isolated':     metrics.isolated++;     break;
            case 'gone_silent':  metrics.gone_silent++;  break;
            case 'unsynced':     metrics.unsynced++;     break;
          }

          // Distribution maps
          const type = d.type ?? 'unknown';
          metrics.byType[type] = (metrics.byType[type] ?? 0) + 1;

          const risk = d.risk ?? 'none';
          metrics.byRisk[risk] = (metrics.byRisk[risk] ?? 0) + 1;

          // Totals
          metrics.totalAlerts        += d.alerts_count ?? 0;
          metrics.totalSyncQueueDepth += d.sync_queue_depth ?? 0;

          if (risk === 'critical') metrics.criticalDevices++;
          if (risk === 'critical' || risk === 'high') metrics.highRiskDevices++;
          if (d.hash_chain_ok === false) metrics.brokenHashChains++;
          if (d.agent_version && d.agent_version !== LATEST_AGENT_VERSION) metrics.outdatedAgents++;
        }

        if (onlineCount > 0) {
          metrics.avgCpuUsage = totalCpu / onlineCount;
          metrics.avgRamUsage = totalRam / onlineCount;
        }

        return metrics;
      },
      60 * 1000
    );
  }

  async getDeviceDistribution(): Promise<{
    byType: Record<string, { total: number; online: number; offline: number }>;
    byStatus: Record<string, number>;
  }> {
    return this.cachedQuery(
      'device_distribution',
      async () => {
        const devices = await this.findDevices({ select: 'type,status' });

        const byType: Record<string, { total: number; online: number; offline: number }> = {};
        const byStatus: Record<string, number> = {};

        for (const d of devices) {
          const type   = d.type   ?? 'unknown';
          const status = d.status ?? 'unknown';

          // byType
          byType[type] ??= { total: 0, online: 0, offline: 0 };
          byType[type].total++;
          if (status === 'online') {
            byType[type].online++;
          } else {
            byType[type].offline++;
          }

          // byStatus
          byStatus[status] = (byStatus[status] ?? 0) + 1;
        }

        return { byType, byStatus };
      },
      5 * 60 * 1000
    );
  }

  async getDeviceHealthStatuses(): Promise<DeviceHealthStatus[]> {
    return this.cachedQuery(
      'device_health_statuses',
      async () => {
        const devices = await this.findDevices();
        return devices.map(buildHealthStatus);
      },
      2 * 60 * 1000
    );
  }

  // ── Realtime ───────────────────────────────────────────────────────────────

  subscribeToDeviceUpdates(
    filters: Partial<DeviceQueryOptions> = {},
    callbacks: DeviceSubscriptionCallbacks = {}
  ): string {
    // Use a timestamp-based suffix so concurrent subscriptions don't collide.
    const channelName = `realtime-devices-${Date.now()}`;

    this.subscribe(channelName, filters, (payload) => {
      try {
        const p = payload as RealtimeDevicePayload;
        switch (p.eventType) {
          case 'INSERT': callbacks.onInsert?.(p.new);          break;
          case 'UPDATE': callbacks.onUpdate?.(p.new);          break;
          case 'DELETE': callbacks.onDelete?.(p.old as Device); break;
        }
      } catch (error) {
        callbacks.onError?.(error);
      }
    });

    // Return the channel name so the caller can unsubscribe later.
    return channelName;
  }

  /** Unsubscribes a specific device realtime channel by its name. */
  unsubscribeFromDeviceUpdates(channelName: string): void {
    this.unsubscribe(channelName);
  }
}

// ─── Pure helpers ────────

function escalate(
  current: DeviceHealthStatus['status'],
  next: DeviceHealthStatus['status']
): DeviceHealthStatus['status'] {
  const rank = { healthy: 0, warning: 1, critical: 2 } as const;
  return rank[next] > rank[current] ? next : current;
}

function buildHealthStatus(device: Device): DeviceHealthStatus {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let status: DeviceHealthStatus['status'] = 'healthy';

  // Connectivity
  switch (device.status) {
    case 'offline':
      issues.push('Device is offline');
      recommendations.push('Check network connectivity');
      status = escalate(status, 'critical');
      break;
    case 'gone_silent':
      issues.push('Device has gone silent');
      recommendations.push('Verify agent is running');
      status = escalate(status, 'warning');
      break;
    case 'unsynced':
      issues.push('Device has unsynced data');
      recommendations.push('Check network connection to server');
      status = escalate(status, 'critical');
      break;
    case 'isolated':
      issues.push('Device is isolated');
      recommendations.push('Re-enable network access when investigation is complete');
      status = escalate(status, 'warning');
      break;
  }

  // CPU
  const cpu = device.cpu_percent ?? 0;
  if (cpu > THRESHOLDS.cpuCritical) {
    issues.push(`Critical CPU usage (${cpu.toFixed(1)}%)`);
    recommendations.push('Investigate high CPU processes');
    status = escalate(status, 'critical');
  } else if (cpu > THRESHOLDS.cpuWarning) {
    issues.push(`High CPU usage (${cpu.toFixed(1)}%)`);
    recommendations.push('Monitor CPU-intensive processes');
    status = escalate(status, 'warning');
  }

  // RAM
  const ram = device.ram_percent ?? 0;
  if (ram > THRESHOLDS.ramCritical) {
    issues.push(`Critical memory usage (${ram.toFixed(1)}%)`);
    recommendations.push('Restart memory-intensive applications');
    status = escalate(status, 'critical');
  } else if (ram > THRESHOLDS.ramWarning) {
    issues.push(`High memory usage (${ram.toFixed(1)}%)`);
    recommendations.push('Check memory-intensive applications');
    status = escalate(status, 'warning');
  }

  // Sync queue
  const queueDepth = device.sync_queue_depth ?? 0;
  if (queueDepth > THRESHOLDS.syncQueueCritical) {
    issues.push(`Large sync queue backlog (${queueDepth})`);
    recommendations.push('Check network bandwidth');
    status = escalate(status, 'critical');
  } else if (queueDepth > THRESHOLDS.syncQueueWarning) {
    issues.push(`Growing sync queue (${queueDepth})`);
    recommendations.push('Monitor network throughput');
    status = escalate(status, 'warning');
  }

  // Hash chain integrity
  if (device.hash_chain_ok === false) {
    issues.push('Hash chain integrity compromised');
    recommendations.push('Investigate potential tampering');
    status = escalate(status, 'critical');
  }

  // Risk level
  if (device.risk === 'critical') {
    recommendations.push('Address critical security alerts immediately');
    status = escalate(status, 'critical');
  } else if (device.risk === 'high') {
    recommendations.push('Review and address high-severity security alerts');
    status = escalate(status, 'warning');
  }

  // Agent version
  if (device.agent_version && device.agent_version !== LATEST_AGENT_VERSION) {
    issues.push(`Outdated agent (${device.agent_version}, latest: ${LATEST_AGENT_VERSION})`);
    recommendations.push('Update agent to latest version');
    status = escalate(status, 'warning');
  }

  return {
    deviceId: device.id,
    deviceName: device.name,
    status,
    issues,
    lastSeen: device.last_seen ?? '',
    syncQueueDepth: queueDepth,
    hashChainOk: device.hash_chain_ok ?? true,
    agentVersion: device.agent_version ?? 'unknown',
    recommendations,
  };
}