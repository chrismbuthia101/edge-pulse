import { create } from "zustand";
import { DeviceRepository } from "@/lib/repositories";
import { DeviceService } from "@/lib/services/device-service";
import {
  AnomalyService,
  anomalyRepository,
} from "@/lib/services/anomaly-service";
import {
  DeviceAssignmentRepository,
  type DeviceAssignment,
} from "@/lib/repositories/device-assignment-repository";
import type {
  DeviceAnalytics,
  UpdateDeviceMetricsParams,
} from "@/lib/services/device-service";
import type { Device } from "@/lib/supabase/types";
import type { AnomalyScore } from "@/lib/repositories/anomaly-repository";
import { toast } from "sonner";

interface DeviceStore {
  devices: Device[];
  onlineCount: number;
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  refreshDevicesForUser: (userId: string, isAdmin: boolean) => Promise<void>;
  updateDevice: (device: Device) => void;
  setDevices: (devices: Device[]) => void;
  clearError: () => void;

  isolateDevice: (deviceId: string) => Promise<void>;
  unisolateDevice: (deviceId: string) => Promise<void>;
  updateDeviceMetrics: (
    deviceId: string,
    metrics: UpdateDeviceMetricsParams,
  ) => Promise<void>;
  deleteDevice: (deviceId: string) => Promise<void>;

  searchDevices: (query: string) => Promise<Device[]>;
  getDevicesNeedingAttention: () => Promise<Device[]>;
  getCriticalDevices: () => Promise<Device[]>;
  getOnlineDevices: () => Promise<Device[]>;

  getMetrics: () => Promise<unknown>;
  getAnalytics: (
    timeframe?: "24h" | "7d" | "30d",
  ) => Promise<DeviceAnalytics | null>;

  getDeviceHealthReport: (deviceId: string) => Promise<unknown>;

  getDeviceAnomalyHistory: (
    deviceId: string,
    limit?: number,
  ) => Promise<AnomalyScore[]>;
  getDeviceAnomalyAnalytics: (
    deviceId: string,
    timeframe?: "24h" | "7d" | "30d",
  ) => Promise<unknown>;
  getLatestAnomalyScore: (deviceId: string) => Promise<AnomalyScore | null>;

  subscribeToDeviceUpdates: () => void;
  unsubscribeFromDeviceUpdates: () => void;

  bulkIsolate: (deviceIds: string[], reason?: string) => Promise<void>;
  bulkUnisolate: (deviceIds: string[]) => Promise<void>;
}

const deviceRepository = new DeviceRepository();
const deviceService = new DeviceService(deviceRepository);
const anomalyService = new AnomalyService(anomalyRepository);
const deviceAssignmentRepository = new DeviceAssignmentRepository();

function countOnline(devices: Device[]): number {
  return devices.filter((d) => d.status === "online").length;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred";
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  devices: [],
  onlineCount: 0,
  loading: false,
  error: null,

  initialize: async () => {
    try {
      set({ loading: true, error: null });
      const result = await deviceService.getDevicesPaginated({
        page: 1,
        limit: 200,
      });
      set({
        devices: result.devices,
        onlineCount: countOnline(result.devices),
        loading: false,
      });
      get().subscribeToDeviceUpdates();
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  refreshDevicesForUser: async (userId: string, isAdmin: boolean) => {
    try {
      set({ loading: true, error: null });

      let devices: Device[];
      if (isAdmin) {
        const result = await deviceService.getDevicesPaginated({
          page: 1,
          limit: 200,
        });
        devices = result.devices;
      } else {
        const assignments =
          await deviceAssignmentRepository.getAssignmentsByUser(userId);
        const deviceIds = assignments.map((a: DeviceAssignment) => a.device_id);

        if (deviceIds.length === 0) {
          devices = [];
        } else {
          devices = await Promise.all(
            deviceIds.map(async (deviceId: string) => {
              try {
                return await deviceRepository.findById(deviceId);
              } catch {
                console.warn(`Device ${deviceId} not found`);
                return null;
              }
            }),
          ).then((devices) => devices.filter(Boolean) as Device[]);
        }
      }

      set({ devices, onlineCount: countOnline(devices), loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  refreshDevices: async () => {
    try {
      set({ loading: true, error: null });
      const result = await deviceService.getDevicesPaginated({
        page: 1,
        limit: 200,
      });
      set({
        devices: result.devices,
        onlineCount: countOnline(result.devices),
        loading: false,
      });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  updateDevice: (device) => {
    set((state) => {
      const exists = state.devices.some((d) => d.id === device.id);
      const devices = exists
        ? state.devices.map((d) => (d.id === device.id ? device : d))
        : [...state.devices, device];

      return { devices, onlineCount: countOnline(devices) };
    });
  },

  setDevices: (devices) => {
    set({ devices, onlineCount: countOnline(devices) });
  },

  clearError: () => set({ error: null }),

  isolateDevice: async (deviceId) => {
    const { devices } = get();
    const previousDevice = devices.find((d) => d.id === deviceId);

    // Optimistic update
    set({
      devices: devices.map((device) =>
        device.id === deviceId ? { ...device, status: "isolated" } : device,
      ),
    });

    try {
      await deviceService.isolateDevice(deviceId);
      toast.success("Device isolated successfully");
    } catch (err) {
      console.error("Failed to isolate device:", err);
      toast.error("Failed to isolate device");
      // Revert optimistic update on error
      if (previousDevice) {
        set({
          devices: devices.map((device) =>
            device.id === deviceId ? previousDevice : device,
          ),
        });
      }
    }
  },

  unisolateDevice: async (deviceId) => {
    const { devices } = get();
    const previousDevice = devices.find((d) => d.id === deviceId);

    set({
      devices: devices.map((device) =>
        device.id === deviceId ? { ...device, status: "online" } : device,
      ),
    });

    try {
      await deviceService.unisolateDevice(deviceId);
      toast.success("Device unisolated successfully");
    } catch (err) {
      console.error("Failed to unisolate device:", err);
      toast.error("Failed to unisolate device");

      if (previousDevice) {
        set({
          devices: devices.map((device) =>
            device.id === deviceId ? previousDevice : device,
          ),
        });
      }
    }
  },

  updateDeviceMetrics: async (deviceId, metrics) => {
    const previous = get().devices.find((d) => d.id === deviceId);

    if (previous) {
      get().updateDevice({
        ...previous,
        cpu_percent: metrics.cpuPercent ?? previous.cpu_percent,
        ram_percent: metrics.ramPercent ?? previous.ram_percent,
        sync_queue_depth: metrics.syncQueueDepth ?? previous.sync_queue_depth,
        actively_reporting:
          metrics.activelyReporting ?? previous.actively_reporting,
      });
    }

    try {
      await deviceService.updateDeviceMetrics(deviceId, metrics);
    } catch (err) {
      // Rollback
      if (previous) get().updateDevice(previous);
      set({ error: errorMessage(err) });
    }
  },

  deleteDevice: async (deviceId) => {
    const { devices } = get();
    const deviceToDelete = devices.find((d) => d.id === deviceId);

    if (!deviceToDelete) {
      toast.error("Device not found");
      return;
    }

    set({
      devices: devices.filter((d) => d.id !== deviceId),
      onlineCount: countOnline(devices.filter((d) => d.id !== deviceId)),
    });

    try {
      await deviceService.deleteDevice(deviceId);
      toast.success(`${deviceToDelete.name} deleted successfully`);
    } catch (err) {
      console.error("Failed to delete device:", err);
      toast.error("Failed to delete device");
      set({
        devices: [...devices],
        onlineCount: countOnline(devices),
      });
    }
  },

  searchDevices: async (query) => {
    try {
      return await deviceService.searchDevices(query);
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getDevicesNeedingAttention: async () => {
    try {
      return await deviceService.getDevicesNeedingAttention();
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getCriticalDevices: async () => {
    try {
      return await deviceService.getCriticalDevices();
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getOnlineDevices: async () => {
    try {
      return await deviceService.getOnlineDevices();
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getMetrics: async () => {
    try {
      return await deviceService.getMetrics();
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  getAnalytics: async (timeframe = "24h") => {
    try {
      return await deviceService.getDeviceAnalytics(timeframe);
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  getDeviceHealthReport: async (deviceId) => {
    try {
      return await deviceService.getDeviceHealthReport(deviceId);
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  getDeviceAnomalyHistory: async (deviceId, limit = 20) => {
    try {
      return await anomalyService.getDeviceAnomalyHistory(deviceId, limit);
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getDeviceAnomalyAnalytics: async (deviceId, timeframe = "24h") => {
    try {
      return await anomalyService.getAnomalyAnalytics(deviceId, timeframe);
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  getLatestAnomalyScore: async (deviceId) => {
    try {
      return await anomalyService.getLatestAnomalyScore(deviceId);
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  subscribeToDeviceUpdates: () => {
    deviceService.subscribeToDeviceUpdates({
      onDeviceOnline: (device) => {
        get().updateDevice(device);
        toast.success(`Device ${device.name} is back online`);
      },
      onDeviceOffline: (device) => {
        get().updateDevice(device);
        toast.warning(`Device ${device.name} went offline`);
      },
      onDeviceHealthChange: (device) => {
        get().updateDevice(device);
      },
      onError: (error) => {
        console.error("[DeviceStore] Realtime error:", error);
      },
    });
  },

  unsubscribeFromDeviceUpdates: () => {
    deviceService.unsubscribeFromDeviceUpdates();
  },

  bulkIsolate: async (deviceIds, reason) => {
    const { devices } = get();
    const previousDevices = devices.filter((d) => deviceIds.includes(d.id));

    set({
      devices: devices.map((device) =>
        deviceIds.includes(device.id)
          ? { ...device, status: "isolated" }
          : device,
      ),
    });

    try {
      await deviceService.bulkDeviceOperation({
        deviceIds,
        operation: "isolate",
        options: { reason },
      });
      toast.success(`${deviceIds.length} devices isolated successfully`);
    } catch (err) {
      console.error("Failed to bulk isolate devices:", err);
      toast.error("Failed to isolate devices");
      set({
        devices: devices.map((device) => {
          const previous = previousDevices.find((p) => p.id === device.id);
          return deviceIds.includes(device.id) && previous ? previous : device;
        }),
      });
    }
  },

  bulkUnisolate: async (deviceIds) => {
    const { devices } = get();
    const previousDevices = devices.filter((d) => deviceIds.includes(d.id));

    set({
      devices: devices.map((device) =>
        deviceIds.includes(device.id)
          ? { ...device, status: "online" }
          : device,
      ),
    });

    try {
      await deviceService.bulkDeviceOperation({
        deviceIds,
        operation: "unisolate",
      });
      toast.success(`${deviceIds.length} devices unisolated successfully`);
    } catch (err) {
      console.error("Failed to bulk unisolate devices:", err);
      toast.error("Failed to unisolate devices");

      set({
        devices: devices.map((device) => {
          const previous = previousDevices.find((p) => p.id === device.id);
          return deviceIds.includes(device.id) && previous ? previous : device;
        }),
      });
    }
  },
}));

export { deviceService, deviceRepository };
