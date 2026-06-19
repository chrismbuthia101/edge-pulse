import { DeviceRepository } from "@/lib/repositories";
import type {
  DeviceMetrics,
  DeviceHealthStatus,
  DeviceSubscriptionCallbacks,
} from "@/lib/repositories/device-repository";
import type { Device, DeviceStatus } from "@/lib/supabase/types";

export interface GetDevicesOptions {
  limit?: number;
  status?: DeviceStatus | DeviceStatus[];
  type?: string | string[];
  risk?: string | string[];
  search?: string;
  onlineOnly?: boolean;
  agentVersion?: string;
  osType?: string;
}

export interface IsolateDeviceOptions {
  reason?: string;
}

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
  options?: IsolateDeviceOptions;
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
  distribution: Awaited<ReturnType<DeviceRepository["getDeviceDistribution"]>>;
  healthStatuses: DeviceHealthStatus[];
}

export class DeviceService {
  private channelName: string | null = null;

  constructor(private readonly repository: DeviceRepository) {}

  async getDevices(options: GetDevicesOptions = {}): Promise<Device[]> {
    return this.repository.findDevices({
      status: options.status,
      type: options.type,
      risk: options.risk,
      search: options.search,
      onlineOnly: options.onlineOnly,
      agentVersion: options.agentVersion,
      osType: options.osType,
      limit: options.limit,
      orderBy: { column: "name", ascending: true },
    });
  }

  async getDeviceById(id: string): Promise<Device | null> {
    return this.repository.findById(id);
  }

  async getOnlineDevices(): Promise<Device[]> {
    return this.repository.getOnlineDevices();
  }

  async getDevicesPaginated(
    options: GetDevicesOptions & { page: number; limit: number },
  ): Promise<{
    devices: Device[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  }> {
    const result = await this.repository.findDevicesPaginated({
      status: options.status,
      type: options.type,
      risk: options.risk,
      search: options.search,
      onlineOnly: options.onlineOnly,
      agentVersion: options.agentVersion,
      osType: options.osType,
      page: options.page,
      limit: options.limit,
      orderBy: { column: "name", ascending: true },
    });

    return {
      devices: result.data,
      total: result.count,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPreviousPage: result.hasPreviousPage,
    };
  }

  async getCriticalDevices(): Promise<Device[]> {
    return this.repository.getCriticalDevices();
  }

  async getDevicesNeedingAttention(): Promise<Device[]> {
    return this.repository.getDevicesNeedingAttention();
  }

  async getDevicesWithPerformanceIssues(): Promise<Device[]> {
    return this.repository.getDevicesWithPerformanceIssues();
  }

  async searchDevices(
    query: string,
    options: GetDevicesOptions = {},
  ): Promise<Device[]> {
    return this.repository.searchDevices(query, {
      status: options.status,
      type: options.type,
      risk: options.risk,
      limit: options.limit,
    });
  }

  async getDevicesByOS(osPattern: string): Promise<Device[]> {
    return this.repository.getDevicesByOS(osPattern);
  }

  async isolateDevice(id: string): Promise<Device> {
    return this.repository.isolateDevice(id);
  }

  async unisolateDevice(id: string): Promise<Device> {
    return this.repository.unisolateDevice(id);
  }

  async updateDeviceMetrics(
    id: string,
    metrics: UpdateDeviceMetricsParams,
  ): Promise<Device> {
    return this.repository.updateDeviceMetrics(id, metrics);
  }

  async updateDeviceStatus(id: string, status: DeviceStatus): Promise<Device> {
    return this.repository.updateDeviceStatus(id, status);
  }

  async bulkDeviceOperation(
    params: BulkDeviceOperationParams,
  ): Promise<Device[]> {
    const { deviceIds, operation } = params;

    if (operation === "isolate") {
      return Promise.all(deviceIds.map((id) => this.isolateDevice(id)));
    }

    return Promise.all(deviceIds.map((id) => this.unisolateDevice(id)));
  }

  async deleteDevice(id: string): Promise<void> {
    return this.repository.delete(id);
  }

  async getMetrics(): Promise<DeviceMetrics> {
    return this.repository.getDeviceMetrics();
  }

  async getDeviceDistribution(): Promise<
    Awaited<ReturnType<DeviceRepository["getDeviceDistribution"]>>
  > {
    return this.repository.getDeviceDistribution();
  }

  async getDeviceHealthStatuses(): Promise<DeviceHealthStatus[]> {
    return this.repository.getDeviceHealthStatuses();
  }

  async getDeviceHealthReport(
    deviceId: string,
  ): Promise<DeviceHealthStatus | null> {
    const statuses = await this.repository.getDeviceHealthStatuses();
    return statuses.find((s) => s.deviceId === deviceId) ?? null;
  }

  async getDeviceAnalytics(
    timeframe: "24h" | "7d" | "30d" = "24h",
  ): Promise<DeviceAnalytics> {
    const [metrics, distribution, healthStatuses] = await Promise.all([
      this.getMetrics(),
      this.getDeviceDistribution(),
      this.getDeviceHealthStatuses(),
    ]);

    return { timeframe, metrics, distribution, healthStatuses };
  }

  // ── Realtime ───────────────────────────────────────────────────────────────

  subscribeToDeviceUpdates(callbacks: DeviceSubscriptionOptions): void {
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
      {},
      repoCallbacks,
    );
  }

  unsubscribeFromDeviceUpdates(): void {
    if (this.channelName) {
      this.repository.unsubscribeFromDeviceUpdates(this.channelName);
      this.channelName = null;
    }
  }
}
