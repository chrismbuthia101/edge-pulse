import { DeviceRepository } from "@/lib/repositories";
import type {
  Device,
  DeviceQueryOptions,
  DeviceMetrics,
  DeviceHealthInfo,
  DeviceHealthStatus,
  DeviceSubscriptionCallbacks,
} from "@/lib/types/devices";
import type { Result } from "@/lib/types/shared";

export interface UpdateDeviceMetricsParams {
  cpuPercent?: number;
  ramPercent?: number;
  syncQueueDepth?: number;
  activelyReporting?: boolean;
}

export type BulkDeviceOperation = "isolate" | "unisolate";

export interface BulkDeviceOperationParams {
  deviceIds: string[];
  operation: BulkDeviceOperation;
}

export interface DeviceSubscriptionOptions {
  onDeviceOnline?: (device: Device) => void;
  onDeviceOffline?: (device: Device) => void;
  onDeviceHealthChange?: (device: Device) => void;
  onError?: (error: Error) => void;
}

export interface DeviceAnalytics {
  timeframe: "24h" | "7d" | "30d";
  metrics: DeviceMetrics;
  distribution: {
    byType: Record<string, { total: number; online: number; offline: number }>;
    byStatus: Record<string, number>;
  };
  healthStatuses: DeviceHealthInfo[];
}

const THRESHOLDS = {
  cpuWarning: 80,
  cpuCritical: 90,
  ramWarning: 80,
  ramCritical: 90,
  diskWarning: 85,
  diskCritical: 95,
  syncQueueWarning: 50,
  syncQueueCritical: 100,
} as const;

export class DeviceService {
  private channelName: string | null = null;

  constructor(private readonly repository: DeviceRepository) {}

  public async getDevicesPaginated(
    options: DeviceQueryOptions & { page: number; limit: number },
  ): Promise<Result<{
    devices: Device[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  }>> {
    const result = await this.repository.findDevicesPaginated(options);
    if (result.error) return { success: false, error: result.error.message };
    if (!result.data) return { success: false, error: "No data returned" };

    return {
      success: true,
      data: {
        devices: result.data.data,
        total: result.data.count,
        page: result.data.page,
        limit: result.data.limit,
        totalPages: result.data.totalPages,
        hasNextPage: result.data.hasNextPage,
        hasPreviousPage: result.data.hasPreviousPage,
      },
    };
  }

  public async searchDevices(
    query: string,
    options: DeviceQueryOptions = {},
  ): Promise<Result<Device[]>> {
    const { data, error } = await this.repository.searchDevices(query, options);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getOnlineDevices(): Promise<Result<Device[]>> {
    const { data, error } = await this.repository.getOnlineDevices();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getCriticalDevices(): Promise<Result<Device[]>> {
    const { data, error } = await this.repository.getCriticalDevices();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getDevicesNeedingAttention(): Promise<Result<Device[]>> {
    const { data: devices, error } = await this.repository.findDevices({
      select: "id,name,status,risk,cpu_percent,ram_percent,sync_queue_depth",
    });
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: devices.filter(
        (d) =>
          d.risk === "critical" ||
          d.status === "offline" ||
          d.status === "gone_silent" ||
          (d.sync_queue_depth ?? 0) > THRESHOLDS.syncQueueWarning ||
          (d.cpu_percent ?? 0) > THRESHOLDS.cpuCritical ||
          (d.ram_percent ?? 0) > THRESHOLDS.ramCritical,
      ),
    };
  }

  public async getDevicesWithPerformanceIssues(): Promise<Result<Device[]>> {
    const { data: devices, error } = await this.repository.findDevices({
      onlineOnly: true,
      select: "id,name,status,risk,cpu_percent,ram_percent,sync_queue_depth",
    });
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: devices.filter(
        (d) =>
          (d.cpu_percent ?? 0) > THRESHOLDS.cpuWarning ||
          (d.ram_percent ?? 0) > THRESHOLDS.ramWarning ||
          (d.sync_queue_depth ?? 0) > THRESHOLDS.syncQueueWarning,
      ),
    };
  }

  public async isolateDevice(id: string): Promise<Result<Device>> {
    const { data, error } = await this.repository.isolateDevice(id);
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Device not found" };
    return { success: true, data };
  }

  public async unisolateDevice(id: string): Promise<Result<Device>> {
    const { data, error } = await this.repository.unisolateDevice(id);
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Device not found" };
    return { success: true, data };
  }

  public async updateDeviceMetrics(
    id: string,
    metrics: UpdateDeviceMetricsParams,
  ): Promise<Result<Device>> {
    const { data, error } = await this.repository.updateDeviceMetrics(id, metrics);
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Device not found" };
    return { success: true, data };
  }

  public async bulkDeviceOperation(
    params: BulkDeviceOperationParams,
  ): Promise<Result<Device[]>> {
    const { deviceIds, operation } = params;
    const status =
      operation === "isolate"
        ? ("isolated" as Device["status"])
        : ("online" as Device["status"]);

    const { data, error } = await this.repository.bulkUpdateStatus(deviceIds, status);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async deleteDevice(id: string): Promise<Result<void>> {
    const { error } = await this.repository.delete(id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }

  public async getMetrics(): Promise<Result<DeviceMetrics>> {
    const { data: devices, error } = await this.repository.findDevices({
      select: "type,risk,alerts_count,sync_queue_depth,agent_version,cpu_percent,ram_percent,status",
    });
    if (error) return { success: false, error: error.message };

    const byType: Record<string, number> = {};
    const byRisk: Record<string, number> = {};
    let totalAlerts = 0;
    let totalSyncQueueDepth = 0;
    let criticalDevices = 0;
    let highRiskDevices = 0;
    let outdatedAgents = 0;
    let totalCpu = 0;
    let totalRam = 0;
    let onlineCount = 0;
    let total = 0;
    let online = 0;
    let offline = 0;
    let isolated = 0;
    let goneSilent = 0;
    let unsynced = 0;

    for (const d of devices) {
      total++;
      const type = d.type ?? "unknown";
      const risk = d.risk ?? "none";

      byType[type] = (byType[type] ?? 0) + 1;
      byRisk[risk] = (byRisk[risk] ?? 0) + 1;

      totalAlerts += d.alerts_count ?? 0;
      totalSyncQueueDepth += d.sync_queue_depth ?? 0;

      if (risk === "critical") criticalDevices++;
      if (risk === "critical" || risk === "high") highRiskDevices++;
      if (d.agent_version) outdatedAgents++;

      switch (d.status) {
        case "online":
          online++;
          totalCpu += d.cpu_percent ?? 0;
          totalRam += d.ram_percent ?? 0;
          onlineCount++;
          break;
        case "offline":
          offline++;
          break;
        case "isolated":
          isolated++;
          break;
        case "gone_silent":
          goneSilent++;
          break;
        case "unsynced":
          unsynced++;
          break;
      }
    }

    return {
      success: true,
      data: {
        total,
        online,
        offline,
        isolated,
        gone_silent: goneSilent,
        unsynced,
        byType,
        byRisk,
        avgCpuUsage: onlineCount > 0 ? totalCpu / onlineCount : 0,
        avgRamUsage: onlineCount > 0 ? totalRam / onlineCount : 0,
        totalAlerts,
        criticalDevices,
        highRiskDevices,
        outdatedAgents,
        totalSyncQueueDepth,
      },
    };
  }

  public async getDeviceDistribution(): Promise<Result<{
    byType: Record<string, { total: number; online: number; offline: number }>;
    byStatus: Record<string, number>;
  }>> {
    const { data: devices, error } = await this.repository.findDevices({
      select: "type,status",
    });
    if (error) return { success: false, error: error.message };

    const byType: Record<string, { total: number; online: number; offline: number }> = {};
    const byStatus: Record<string, number> = {};

    for (const d of devices) {
      const type = d.type ?? "unknown";
      const status = d.status ?? "unknown";

      byType[type] ??= { total: 0, online: 0, offline: 0 };
      byType[type].total++;
      if (status === "online") {
        byType[type].online++;
      } else {
        byType[type].offline++;
      }

      byStatus[status] = (byStatus[status] ?? 0) + 1;
    }

    return { success: true, data: { byType, byStatus } };
  }

  public async getDeviceHealthStatuses(): Promise<Result<DeviceHealthInfo[]>> {
    const { data: devices, error } = await this.repository.findDevices();
    if (error) return { success: false, error: error.message };
    return { success: true, data: devices.map(buildHealthStatus) };
  }

  public async getDeviceAnalytics(
    timeframe: "24h" | "7d" | "30d" = "24h",
  ): Promise<Result<DeviceAnalytics>> {
    const [metricsResult, distributionResult, healthResult] = await Promise.all([
      this.getMetrics(),
      this.getDeviceDistribution(),
      this.getDeviceHealthStatuses(),
    ]);

    if (!metricsResult.success) return metricsResult;
    if (!distributionResult.success) return distributionResult;
    if (!healthResult.success) return healthResult;

    return {
      success: true,
      data: {
        timeframe,
        metrics: metricsResult.data,
        distribution: distributionResult.data,
        healthStatuses: healthResult.data,
      },
    };
  }

  subscribeToDeviceUpdates(callbacks: DeviceSubscriptionOptions): () => void {
    if (this.channelName) {
      this.repository.unsubscribeFromDeviceUpdates(this.channelName);
    }

    const repoCallbacks: DeviceSubscriptionCallbacks = {
      onInsert: (device) => {
        callbacks.onDeviceOnline?.(device);
      },
      onUpdate: (device) => {
        if (device.status === "online") {
          callbacks.onDeviceOnline?.(device);
        } else if (
          device.status === "offline" ||
          device.status === "gone_silent"
        ) {
          callbacks.onDeviceOffline?.(device);
        } else {
          callbacks.onDeviceHealthChange?.(device);
        }
      },
      onDelete: (device) => {
        callbacks.onDeviceOffline?.(device);
      },
      onError: (err) => {
        callbacks.onError?.(
          err instanceof Error ? err : new Error(String(err)),
        );
      },
    };

    this.channelName = this.repository.subscribeToDeviceUpdates(
      repoCallbacks
    );

    const currentChannel = this.channelName;
    return () => {
      if (this.channelName === currentChannel) {
        this.repository.unsubscribeFromDeviceUpdates(this.channelName);
        this.channelName = null;
      }
    };
  }

  unsubscribeFromDeviceUpdates(): void {
    if (this.channelName) {
      this.repository.unsubscribeFromDeviceUpdates(this.channelName);
      this.channelName = null;
    }
  }
}

function escalate(
  current: DeviceHealthStatus,
  next: DeviceHealthStatus,
): DeviceHealthStatus {
  const rank = { healthy: 0, warning: 1, critical: 2 } as const;
  return rank[next] > rank[current] ? next : current;
}

function buildHealthStatus(device: Device): DeviceHealthInfo {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let status: DeviceHealthStatus = "healthy";

  switch (device.status) {
    case "offline":
      issues.push("Device is offline");
      recommendations.push("Check network connectivity");
      status = escalate(status, "critical");
      break;
    case "gone_silent":
      issues.push("Device has gone silent");
      recommendations.push("Verify agent is running");
      status = escalate(status, "warning");
      break;
    case "unsynced":
      issues.push("Device has unsynced data");
      recommendations.push("Check network connection to server");
      status = escalate(status, "critical");
      break;
    case "isolated":
      issues.push("Device is isolated");
      recommendations.push(
        "Re-enable network access when investigation is complete",
      );
      status = escalate(status, "warning");
      break;
  }

  const cpu = device.cpu_percent ?? 0;
  if (cpu > THRESHOLDS.cpuCritical) {
    issues.push(`Critical CPU usage (${cpu.toFixed(1)}%)`);
    recommendations.push("Investigate high CPU processes");
    status = escalate(status, "critical");
  } else if (cpu > THRESHOLDS.cpuWarning) {
    issues.push(`High CPU usage (${cpu.toFixed(1)}%)`);
    recommendations.push("Monitor CPU-intensive processes");
    status = escalate(status, "warning");
  }

  const ram = device.ram_percent ?? 0;
  if (ram > THRESHOLDS.ramCritical) {
    issues.push(`Critical memory usage (${ram.toFixed(1)}%)`);
    recommendations.push("Restart memory-intensive applications");
    status = escalate(status, "critical");
  } else if (ram > THRESHOLDS.ramWarning) {
    issues.push(`High memory usage (${ram.toFixed(1)}%)`);
    recommendations.push("Check memory-intensive applications");
    status = escalate(status, "warning");
  }

  const queueDepth = device.sync_queue_depth ?? 0;
  if (queueDepth > THRESHOLDS.syncQueueCritical) {
    issues.push(`Large sync queue backlog (${queueDepth})`);
    recommendations.push("Check network bandwidth");
    status = escalate(status, "critical");
  } else if (queueDepth > THRESHOLDS.syncQueueWarning) {
    issues.push(`Growing sync queue (${queueDepth})`);
    recommendations.push("Monitor network throughput");
    status = escalate(status, "warning");
  }

  if (device.risk === "critical") {
    recommendations.push("Address critical security alerts immediately");
    status = escalate(status, "critical");
  } else if (device.risk === "high") {
    recommendations.push("Review and address high-severity security alerts");
    status = escalate(status, "warning");
  }

  if (device.agent_version) {
    issues.push(`Agent version: ${device.agent_version}`);
    recommendations.push("Ensure agent is up-to-date");
    status = escalate(status, "warning");
  }

  return {
    deviceId: device.id,
    deviceName: device.name,
    status,
    issues,
    lastSeen: device.last_seen ?? "",
    syncQueueDepth: queueDepth,
    agentVersion: device.agent_version ?? "unknown",
    recommendations,
  };
}
