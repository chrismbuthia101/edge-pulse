import { create } from 'zustand';
import { DeviceRepository } from '@/lib/repositories';
import { DeviceService } from '@/lib/services/device-service';
import { AnomalyService, anomalyRepository } from '@/lib/services/anomaly-service';
import type { DeviceAnalytics, UpdateDeviceMetricsParams } from '@/lib/services/device-service';
import type { Device } from '@/lib/supabase/types';
import type { AnomalyScore } from '@/lib/repositories/anomaly-repository';
import { toast } from 'sonner';

interface DeviceStore {

  devices: Device[];
  onlineCount: number;
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  updateDevice: (device: Device) => void;
  setDevices: (devices: Device[]) => void;
  clearError: () => void;

  isolateDevice: (deviceId: string, reason?: string) => Promise<void>;
  unisolateDevice: (deviceId: string) => Promise<void>;
  updateDeviceMetrics: (deviceId: string, metrics: UpdateDeviceMetricsParams) => Promise<void>;

  searchDevices: (query: string) => Promise<Device[]>;
  getDevicesNeedingAttention: () => Promise<Device[]>;
  getCriticalDevices: () => Promise<Device[]>;
  getOnlineDevices: () => Promise<Device[]>;

  getMetrics: () => Promise<unknown>;
  getAnalytics: (timeframe?: '24h' | '7d' | '30d') => Promise<DeviceAnalytics | null>;

  getDeviceHealthReport: (deviceId: string) => Promise<unknown>;

  // Anomaly data methods
  getDeviceAnomalyHistory: (deviceId: string, limit?: number) => Promise<AnomalyScore[]>;
  getDeviceAnomalyAnalytics: (deviceId: string, timeframe?: '24h' | '7d' | '30d') => Promise<unknown>;
  getLatestAnomalyScore: (deviceId: string) => Promise<AnomalyScore | null>;

  subscribeToDeviceUpdates: () => void;
  unsubscribeFromDeviceUpdates: () => void;

  bulkIsolate: (deviceIds: string[], reason?: string) => Promise<void>;
  bulkUnisolate: (deviceIds: string[]) => Promise<void>;
}

const deviceRepository = new DeviceRepository();
const deviceService = new DeviceService(deviceRepository);
const anomalyService = new AnomalyService(anomalyRepository);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function countOnline(devices: Device[]): number {
  return devices.filter((d) => d.status === 'online').length;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An unexpected error occurred';
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  devices: [],
  onlineCount: 0,
  loading: false,
  error: null,

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  initialize: async () => {
    try {
      set({ loading: true, error: null });
      const result = await deviceService.getDevicesPaginated({ page: 1, limit: 200 });
      set({ devices: result.devices, onlineCount: countOnline(result.devices), loading: false });
      get().subscribeToDeviceUpdates();
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  refreshDevices: async () => {
    try {
      set({ loading: true, error: null });
      const result = await deviceService.getDevicesPaginated({ page: 1, limit: 200 });
      set({ devices: result.devices, onlineCount: countOnline(result.devices), loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  // ── Local mutations ────────────────────────────────────────────────────────

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

  // ── Remote mutations ───────────────────────────────────────────────────────

  isolateDevice: async (deviceId) => {
    try {
      await deviceService.isolateDevice(deviceId);
      await get().refreshDevices();
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  unisolateDevice: async (deviceId) => {
    try {
      await deviceService.unisolateDevice(deviceId);
      await get().refreshDevices();
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  updateDeviceMetrics: async (deviceId, metrics) => {
    const previous = get().devices.find((d) => d.id === deviceId);

    // Optimistic update
    if (previous) {
      get().updateDevice({
        ...previous,
        cpu_percent: metrics.cpuPercent ?? previous.cpu_percent,
        ram_percent: metrics.ramPercent ?? previous.ram_percent,
        sync_queue_depth: metrics.syncQueueDepth ?? previous.sync_queue_depth,
        hash_chain_ok: metrics.hashChainOk ?? previous.hash_chain_ok,
        actively_reporting: metrics.activelyReporting ?? previous.actively_reporting,
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

  // ── Queries (return data, not stored) ─────────────────────────────────────

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

  getAnalytics: async (timeframe = '24h') => {
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

  // ── Anomaly data methods ─────────────────────────────────────────────────────

  getDeviceAnomalyHistory: async (deviceId, limit = 20) => {
    try {
      return await anomalyService.getDeviceAnomalyHistory(deviceId, limit);
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getDeviceAnomalyAnalytics: async (deviceId, timeframe = '24h') => {
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

  // ── Realtime ───────────────────────────────────────────────────────────────

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
        console.error('[DeviceStore] Realtime error:', error);
      },
    });
  },

  unsubscribeFromDeviceUpdates: () => {
    deviceService.unsubscribeFromDeviceUpdates();
  },

  // ── Bulk operations ────────────────────────────────────────────────────────

  bulkIsolate: async (deviceIds, reason) => {
    try {
      await deviceService.bulkDeviceOperation({
        deviceIds,
        operation: 'isolate',
        options: { reason },
      });
      await get().refreshDevices();
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  bulkUnisolate: async (deviceIds) => {
    try {
      await deviceService.bulkDeviceOperation({
        deviceIds,
        operation: 'unisolate',
      });
      await get().refreshDevices();
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },
}));

export { deviceService, deviceRepository };