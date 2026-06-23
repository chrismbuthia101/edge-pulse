import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DeviceService } from "@/lib/services/device-service";
import { DeviceRepository } from "@/lib/repositories/device-repository";
import { DeviceAssignmentRepository } from "@/lib/repositories/device-assignment-repository";
import type { UpdateDeviceMetricsParams } from "@/lib/services/device-service";
import type { Device } from "@/lib/types/devices";
import { errorMessage } from "@/lib/utils/error";
import { toast } from "sonner";
import { createClient } from "@/lib/config/client";

type Status = "idle" | "loading" | "success" | "error";

let deviceService: DeviceService | null = null;
function getDeviceService(): DeviceService {
  if (!deviceService) {
    deviceService = new DeviceService(new DeviceRepository(createClient()));
  }
  return deviceService;
}

let deviceAssignmentRepository: DeviceAssignmentRepository | null = null;
function getDeviceAssignmentRepository(): DeviceAssignmentRepository {
  if (!deviceAssignmentRepository) {
    deviceAssignmentRepository = new DeviceAssignmentRepository(createClient());
  }
  return deviceAssignmentRepository;
}

let deviceCleanup: (() => void) | null = null;

function countOnline(devices: Device[]): number {
  return devices.filter((d) => d.status === "online").length;
}

const initialState = {
  devices: [] as Device[],
  onlineCount: 0,
  status: "idle" as Status,
  error: null as string | null,
};

type DeviceStore = typeof initialState & {
  initialize: (supabaseClient?: SupabaseClient) => void;
  refreshDevices: () => Promise<void>;
  refreshDevicesForUser: (userId: string, isAdmin: boolean) => Promise<void>;
  fetchDevices: () => Promise<void>;
  updateDevice: (device: Device) => void;
  setDevices: (devices: Device[]) => void;
  clearError: () => void;
  isolateDevice: (deviceId: string) => Promise<void>;
  unisolateDevice: (deviceId: string) => Promise<void>;
  updateDeviceMetrics: (deviceId: string, metrics: UpdateDeviceMetricsParams) => Promise<void>;
  deleteDevice: (deviceId: string) => Promise<void>;
  searchDevices: (query: string) => Promise<Device[]>;
  getDevicesNeedingAttention: () => Promise<Device[]>;
  getCriticalDevices: () => Promise<Device[]>;
  getOnlineDevices: () => Promise<Device[]>;
  getMetrics: () => Promise<unknown>;
  getAnalytics: (timeframe?: "24h" | "7d" | "30d") => Promise<unknown>;
  subscribeToDeviceUpdates: () => void;
  unsubscribeFromDeviceUpdates: () => void;
  bulkIsolate: (deviceIds: string[], reason?: string) => Promise<void>;
  bulkUnisolate: (deviceIds: string[]) => Promise<void>;
};

export const useDeviceStore = create<DeviceStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      initialize: (supabaseClient) => {
        const client = supabaseClient ?? createClient();
        deviceService = new DeviceService(new DeviceRepository(client));
        deviceAssignmentRepository = new DeviceAssignmentRepository(client);
      },

      refreshDevices: async () => {
        await get().fetchDevices();
      },

      refreshDevicesForUser: async (userId: string, isAdmin: boolean) => {
        set({ status: "loading" });

        try {
          let devices: Device[];
          if (isAdmin) {
            await get().fetchDevices();
            return;
          }

          const { data: assignments, error: assignmentsError } =
            await getDeviceAssignmentRepository().getAssignmentsByUser(userId);
          if (assignmentsError) throw assignmentsError;

          const deviceIds = [
            ...new Set(assignments.map((a) => a.device_id)),
          ];

          if (deviceIds.length === 0) {
            devices = [];
          } else {
            const result = await getDeviceService().getDevicesPaginated({
              page: 1,
              limit: 200,
            });
            if (!result.success) throw new Error(result.error);
            devices = result.data.devices.filter((d) =>
              deviceIds.includes(d.id),
            );
          }

          set({ devices, onlineCount: countOnline(devices), status: "success" });
        } catch (err) {
          set({ error: errorMessage(err), status: "error" });
        }
      },

      fetchDevices: async () => {
        set({ status: "loading" });
        const result = await getDeviceService().getDevicesPaginated({
          page: 1,
          limit: 200,
        });
        if (!result.success) {
          set({ error: result.error, status: "error" });
          return;
        }
        const devices = result.data.devices;
        set({
          devices,
          onlineCount: countOnline(devices),
          status: "success",
        });
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

        set({
          devices: devices.map((device) =>
            device.id === deviceId ? { ...device, status: "isolated" } : device,
          ),
        });

        const result = await getDeviceService().isolateDevice(deviceId);
        if (!result.success) {
          console.error("Failed to isolate device:", result.error);
          toast.error("Failed to isolate device");
          if (previousDevice) {
            set({
              devices: devices.map((device) =>
                device.id === deviceId ? previousDevice : device,
              ),
            });
          }
        } else {
          toast.success("Device isolated successfully");
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

        const result = await getDeviceService().unisolateDevice(deviceId);
        if (!result.success) {
          console.error("Failed to unisolate device:", result.error);
          toast.error("Failed to unisolate device");

          if (previousDevice) {
            set({
              devices: devices.map((device) =>
                device.id === deviceId ? previousDevice : device,
              ),
            });
          }
        } else {
          toast.success("Device unisolated successfully");
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

        const result = await getDeviceService().updateDeviceMetrics(deviceId, metrics);
        if (!result.success) {
          if (previous) get().updateDevice(previous);
          set({ error: result.error });
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

        const result = await getDeviceService().deleteDevice(deviceId);
        if (!result.success) {
          console.error("Failed to delete device:", result.error);
          toast.error("Failed to delete device");
          set({
            devices: [...devices],
            onlineCount: countOnline(devices),
          });
        } else {
          toast.success(`${deviceToDelete.name} deleted successfully`);
        }
      },

      searchDevices: async (query) => {
        const result = await getDeviceService().searchDevices(query);
        if (!result.success) {
          set({ error: result.error });
          return [];
        }
        return result.data;
      },

      getDevicesNeedingAttention: async () => {
        const result = await getDeviceService().getDevicesNeedingAttention();
        if (!result.success) {
          set({ error: result.error });
          return [];
        }
        return result.data;
      },

      getCriticalDevices: async () => {
        const result = await getDeviceService().getCriticalDevices();
        if (!result.success) {
          set({ error: result.error });
          return [];
        }
        return result.data;
      },

      getOnlineDevices: async () => {
        const result = await getDeviceService().getOnlineDevices();
        if (!result.success) {
          set({ error: result.error });
          return [];
        }
        return result.data;
      },

      getMetrics: async () => {
        const result = await getDeviceService().getMetrics();
        if (!result.success) {
          set({ error: result.error });
          return null;
        }
        return result.data;
      },

      getAnalytics: async (timeframe = "24h") => {
        const result = await getDeviceService().getDeviceAnalytics(timeframe);
        if (!result.success) {
          set({ error: result.error });
          return null;
        }
        return result.data;
      },

      subscribeToDeviceUpdates: () => {
        const unsubscribe = getDeviceService().subscribeToDeviceUpdates({
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
        deviceCleanup = unsubscribe;
      },

      unsubscribeFromDeviceUpdates: () => {
        if (deviceCleanup) {
          deviceCleanup();
          deviceCleanup = null;
        }
      },

      bulkIsolate: async (deviceIds) => {
        const { devices } = get();
        const previousDevices = devices.filter((d) => deviceIds.includes(d.id));

        set({
          devices: devices.map((device) =>
            deviceIds.includes(device.id)
              ? { ...device, status: "isolated" }
              : device,
          ),
        });

        const result = await getDeviceService().bulkDeviceOperation({
          deviceIds,
          operation: "isolate",
        });
        if (!result.success) {
          console.error("Failed to bulk isolate devices:", result.error);
          toast.error("Failed to isolate devices");
          set({
            devices: devices.map((device) => {
              const previous = previousDevices.find((p) => p.id === device.id);
              return deviceIds.includes(device.id) && previous ? previous : device;
            }),
          });
        } else {
          toast.success(`${deviceIds.length} devices isolated successfully`);
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

        const result = await getDeviceService().bulkDeviceOperation({
          deviceIds,
          operation: "unisolate",
        });
        if (!result.success) {
          console.error("Failed to bulk unisolate devices:", result.error);
          toast.error("Failed to unisolate devices");

          set({
            devices: devices.map((device) => {
              const previous = previousDevices.find((p) => p.id === device.id);
              return deviceIds.includes(device.id) && previous ? previous : device;
            }),
          });
        } else {
          toast.success(`${deviceIds.length} devices unisolated successfully`);
        }
      },
    }),
    { name: "DeviceStore" },
  ),
);
