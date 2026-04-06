import { create } from 'zustand';
import { HealthRepository } from '@/lib/repositories';
import { HealthService } from '@/lib/services/health-service';
import type { DeviceHealth, SystemHealth } from '@/lib/supabase/types';
import { toast } from 'sonner';

interface HealthStore {
  devices: DeviceHealth[];
  systemHealth: SystemHealth | null;
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  refreshHealthData: () => Promise<void>;
  setDevices: (devices: DeviceHealth[]) => void;
  setSystemHealth: (systemHealth: SystemHealth | null) => void;
  clearError: () => void;

  getDeviceById: (deviceId: string) => DeviceHealth | null;
  getSystemMetrics: () => Promise<SystemHealth | null>;

  subscribeToHealthUpdates: () => void;
  unsubscribeFromHealthUpdates: () => void;
}

const healthRepository = new HealthRepository();
const healthService = new HealthService({ repository: healthRepository });

let healthSubscription: { unsubscribe: () => void } | null = null;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An unexpected error occurred';
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useHealthStore = create<HealthStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  devices: [],
  systemHealth: null,
  loading: false,
  error: null,

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  initialize: async () => {
    try {
      set({ loading: true, error: null });

      const [devices, systemHealth] = await Promise.all([
        healthService.getDeviceHealth({ limit: 100 }),
        healthService.getSystemHealth()
      ]);

      set({ devices, systemHealth, loading: false });

      // Subscribe to realtime updates
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
        healthService.getSystemHealth()
      ]);

      set({ devices, systemHealth, loading: false });
      toast.success('Health data refreshed');
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
      toast.error('Failed to refresh health data');
    }
  },

  // ── Local mutations ────────────────────────────────────────────────────────

  setDevices: (devices) => set({ devices }),

  setSystemHealth: (systemHealth) => set({ systemHealth }),

  clearError: () => set({ error: null }),

  // ── Queries ───────────────────────────────────────────────────────────────

  getDeviceById: (deviceId) => {
    return get().devices.find(d => d.device_id === deviceId) || null;
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

  // ── Realtime subscriptions ─────────────────────────────────────────────────────

  subscribeToHealthUpdates: () => {
    if (healthSubscription) return; // Already subscribed

    healthSubscription = healthService.subscribeToHealthUpdates({
      onDeviceHealthUpdate: (device) => {
        set((state) => {
          const devices = state.devices.map((d) =>
            d.device_id === device.device_id ? device : d
          );
          return { devices };
        });
      },
      onSystemHealthUpdate: (systemHealth) => {
        set({ systemHealth });
      },
      onError: (error) => {
        set({ error: errorMessage(error) });
      },
    });
  },

  unsubscribeFromHealthUpdates: () => {
    if (healthSubscription) {
      healthSubscription.unsubscribe();
      healthSubscription = null;
    }
  },
}));

export { healthService, healthRepository };
