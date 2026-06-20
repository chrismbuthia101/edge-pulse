import { create } from "zustand";
import { HealthRepository } from "@/lib/repositories";
import { HealthService } from "@/lib/services/health-service";
import type { DeviceHealthSnapshot, SystemHealth } from "@/lib/supabase/types";
import { errorMessage } from "@/lib/utils/error";
import { toast } from "sonner";

interface HealthStore {
  devices: DeviceHealthSnapshot[];
  systemHealth: SystemHealth | null;
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  refreshHealthData: () => Promise<void>;
  setDevices: (devices: DeviceHealthSnapshot[]) => void;
  setSystemHealth: (systemHealth: SystemHealth | null) => void;
  clearError: () => void;

  getDeviceById: (deviceId: string) => DeviceHealthSnapshot | null;
  getSystemMetrics: () => Promise<SystemHealth | null>;

  subscribeToHealthUpdates: () => void;
  unsubscribeFromHealthUpdates: () => void;
}

const healthRepository = new HealthRepository();
const healthService = new HealthService({ repository: healthRepository });

let healthChannelName: string | null = null;

export const useHealthStore = create<HealthStore>((set, get) => ({
  devices: [],
  systemHealth: null,
  loading: false,
  error: null,

  initialize: async () => {
    try {
      set({ loading: true, error: null });

      const [devices, systemHealth] = await Promise.all([
        healthService.getDeviceHealth({ limit: 100 }),
        healthService.getSystemHealth(),
      ]);

      set({ devices, systemHealth, loading: false });

      get().subscribeToHealthUpdates();
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  refreshHealthData: async () => {
    try {
      set({ loading: true, error: null });

      const [devices, systemHealth] = await Promise.all([
        healthService.refreshDeviceHealth(),
        healthService.getSystemHealth(),
      ]);

      set({ devices, systemHealth, loading: false });
      toast.success("Health data refreshed");
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
      toast.error("Failed to refresh health data");
    }
  },

  setDevices: (devices) => set({ devices }),

  setSystemHealth: (systemHealth) => set({ systemHealth }),

  clearError: () => set({ error: null }),

  getDeviceById: (deviceId) => {
    return get().devices.find((d) => d.device_id === deviceId) || null;
  },

  getSystemMetrics: async () => {
    try {
      const systemHealth = await healthService.getSystemHealth();
      set({ systemHealth });
      return systemHealth;
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  subscribeToHealthUpdates: () => {
    if (healthChannelName) return;

    healthChannelName = healthService.subscribeToHealthUpdates({
      onDeviceHealthUpdate: (snapshot) => {
        set((state) => {
          const idx = state.devices.findIndex(
            (d) => d.device_id === snapshot.device_id,
          );
          if (idx >= 0) {
            const devices = [...state.devices];
            devices[idx] = snapshot;
            return { devices };
          }
          return {
            devices: [snapshot, ...state.devices].slice(0, 100),
          };
        });
      },
      onError: (error) => {
        console.error("[HealthStore] Realtime error:", error);
      },
    });
  },

  unsubscribeFromHealthUpdates: () => {
    if (healthChannelName) {
      healthService.unsubscribeFromHealthUpdates(healthChannelName);
      healthChannelName = null;
    }
  },
}));

export { healthService, healthRepository };
