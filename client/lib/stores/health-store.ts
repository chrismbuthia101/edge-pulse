import { create } from "zustand";
import { HealthRepository } from "@/lib/repositories";
import { HealthService } from "@/lib/services/health-service";
import type { DeviceHealthSnapshot, SystemHealth } from "@/lib/supabase/types";
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

let healthSubscription: { unsubscribe: () => void } | null = null;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred";
}

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
    if (healthSubscription) return; // Already subscribed

    // TODO: Implement proper subscription when service is ready
    // For now, create a placeholder subscription
    healthSubscription = {
      unsubscribe: () => {
        healthSubscription = null;
      },
    };
  },

  unsubscribeFromHealthUpdates: () => {
    if (healthSubscription) {
      healthSubscription.unsubscribe();
      healthSubscription = null;
    }
  },
}));

export { healthService, healthRepository };
