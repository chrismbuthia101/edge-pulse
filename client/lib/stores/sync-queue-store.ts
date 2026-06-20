import { create } from "zustand";
import { SyncQueueRepository } from "@/lib/repositories";
import { SyncQueueService } from "@/lib/services/sync-queue-service";
import type { DeviceSyncQueueSummary } from "@/lib/supabase/types";
import type { SyncQueueItem } from "@/lib/repositories/sync-queue-repository";
import { errorMessage } from "@/lib/utils/error";

interface SyncQueueStore {
  summaries: DeviceSyncQueueSummary[];
  items: SyncQueueItem[];
  loading: boolean;
  error: string | null;

  totalPending: number;
  totalFailed: number;
  devicesWithIssues: number;

  initialize: () => Promise<void>;
  refreshSummaries: () => Promise<void>;
  refreshItems: () => Promise<void>;
  addSummary: (summary: DeviceSyncQueueSummary) => void;
  updateSummary: (
    deviceId: string,
    updates: Partial<DeviceSyncQueueSummary>,
  ) => void;
  setSummaries: (summaries: DeviceSyncQueueSummary[]) => void;
  setItems: (items: SyncQueueItem[]) => void;
  clearError: () => void;

  getItemsByDevice: (deviceId: string) => Promise<SyncQueueItem[]>;
  getPendingItems: () => Promise<SyncQueueItem[]>;
  getFailedItems: () => Promise<SyncQueueItem[]>;
  getMetrics: () => Promise<{
    totalPending: number;
    totalFailed: number;
    devicesWithIssues: number;
    oldestPendingAge: number | null;
  }>;

  subscribeToSyncQueue: () => void;
  unsubscribeFromSyncQueue: () => void;
}

const syncQueueRepository = new SyncQueueRepository();
const syncQueueService = new SyncQueueService(syncQueueRepository);

function deriveMetrics(
  summaries: DeviceSyncQueueSummary[],
): Pick<SyncQueueStore, "totalPending" | "totalFailed" | "devicesWithIssues"> {
  const totalPending = summaries.reduce((sum, s) => sum + s.pending_count, 0);
  const totalFailed = summaries.reduce((sum, s) => sum + s.failed_count, 0);
  const devicesWithIssues = summaries.filter(
    (s) => s.pending_count > 0 || s.failed_count > 0,
  ).length;

  return {
    totalPending,
    totalFailed,
    devicesWithIssues,
  };
}

export const useSyncQueueStore = create<SyncQueueStore>((set, get) => ({
  
  summaries: [],
  items: [],
  loading: false,
  error: null,
  totalPending: 0,
  totalFailed: 0,
  devicesWithIssues: 0,

  initialize: async () => {
    try {
      set({ loading: true, error: null });
      const summaries = await syncQueueService.getDeviceSyncQueueSummaries();
      set({
        summaries,
        ...deriveMetrics(summaries),
        loading: false,
      });
      get().subscribeToSyncQueue();
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  refreshSummaries: async () => {
    try {
      set({ loading: true, error: null });
      const summaries = await syncQueueService.getDeviceSyncQueueSummaries();
      set({ summaries, ...deriveMetrics(summaries), loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  refreshItems: async () => {
    try {
      set({ loading: true, error: null });
      const items = await syncQueueService.getSyncQueueItems({ limit: 100 });
      set({ items, loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  addSummary: (summary) => {
    set((state) => {
      const existingIndex = state.summaries.findIndex(
        (s) => s.device_id === summary.device_id,
      );
      let newSummaries: DeviceSyncQueueSummary[];

      if (existingIndex >= 0) {
        // Update existing summary
        newSummaries = state.summaries.map((s, i) =>
          i === existingIndex ? summary : s,
        );
      } else {
        // Add new summary
        newSummaries = [summary, ...state.summaries];
      }

      return { summaries: newSummaries, ...deriveMetrics(newSummaries) };
    });
  },

  updateSummary: (deviceId, updates) => {
    set((state) => {
      const summaries = state.summaries.map((s) =>
        s.device_id === deviceId ? { ...s, ...updates } : s,
      );
      return { summaries, ...deriveMetrics(summaries) };
    });
  },

  setSummaries: (summaries) => {
    set({ summaries, ...deriveMetrics(summaries) });
  },

  setItems: (items) => {
    set({ items });
  },

  clearError: () => set({ error: null }),

  getItemsByDevice: async (deviceId) => {
    try {
      return await syncQueueService.getSyncQueueByDevice(deviceId);
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getPendingItems: async () => {
    try {
      return await syncQueueService.getPendingSyncQueueItems();
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getFailedItems: async () => {
    try {
      return await syncQueueService.getFailedSyncQueueItems();
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getMetrics: async () => {
    try {
      return await syncQueueService.getSyncQueueMetrics();
    } catch (err) {
      set({ error: errorMessage(err) });
      return {
        totalPending: 0,
        totalFailed: 0,
        devicesWithIssues: 0,
        oldestPendingAge: null,
      };
    }
  },

  subscribeToSyncQueue: () => {
    syncQueueService.subscribeToSyncQueue({
      onNewItem: () => {
        get().refreshSummaries();
      },
      onItemUpdated: () => {
        get().refreshSummaries();
      },
      onItemDeleted: () => {
        get().refreshSummaries();
      },
      onError: (error) => {
        console.error("[SyncQueueStore] Realtime error:", error);
      },
    });
  },

  unsubscribeFromSyncQueue: () => {
    syncQueueService.unsubscribeFromSyncQueue();
  },
}));

export { syncQueueService, syncQueueRepository };
