import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SyncQueueService } from "@/lib/services/sync-queue-service";
import type { DeviceSyncQueueSummary } from "@/lib/types/sync";
import type { SyncQueueItem } from "@/lib/repositories/sync-queue-repository";
import { errorMessage } from "@/lib/utils/error";
import { createClient } from "@/lib/config/client";

type Status = "idle" | "loading" | "success" | "error";

let syncQueueService: SyncQueueService | null = null;
export function getSyncQueueService(): SyncQueueService {
  if (!syncQueueService) {
    syncQueueService = new SyncQueueService(createClient());
  }
  return syncQueueService;
}

function deriveMetrics(summaries: DeviceSyncQueueSummary[]) {
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

const initialState = {
  summaries: [] as DeviceSyncQueueSummary[],
  items: [] as SyncQueueItem[],
  status: "idle" as Status,
  error: null as string | null,
  totalPending: 0,
  totalFailed: 0,
  devicesWithIssues: 0,
};

type SyncQueueStore = typeof initialState & {
  initialize: (supabaseClient: SupabaseClient) => void;
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
};

export const useSyncQueueStore = create<SyncQueueStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      initialize: (supabaseClient: SupabaseClient) => {
        syncQueueService = new SyncQueueService(supabaseClient);
      },

      refreshSummaries: async () => {
        set({ status: "loading" });
        const { data, error } =
          await getSyncQueueService().getDeviceSyncQueueSummaries();
        if (error) {
          set({ error: errorMessage(error), status: "error" });
        } else {
          set({
            summaries: data ?? [],
            ...deriveMetrics(data ?? []),
            status: "success",
          });
        }
      },

      refreshItems: async () => {
        set({ status: "loading" });
        const { data, error } = await getSyncQueueService().getSyncQueueItems({
          limit: 100,
        });
        if (error) {
          set({ error: errorMessage(error), status: "error" });
        } else {
          set({ items: data ?? [], status: "success" });
        }
      },

      addSummary: (summary) => {
        set((state) => {
          const existingIndex = state.summaries.findIndex(
            (s) => s.device_id === summary.device_id,
          );
          let newSummaries: DeviceSyncQueueSummary[];

          if (existingIndex >= 0) {
            newSummaries = state.summaries.map((s, i) =>
              i === existingIndex ? summary : s,
            );
          } else {
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
        const { data, error } =
          await getSyncQueueService().getSyncQueueByDevice(deviceId);
        if (error) {
          set({ error: errorMessage(error) });
          return [];
        }
        return data ?? [];
      },

      getPendingItems: async () => {
        const { data, error } =
          await getSyncQueueService().getPendingSyncQueueItems();
        if (error) {
          set({ error: errorMessage(error) });
          return [];
        }
        return data ?? [];
      },

      getFailedItems: async () => {
        const { data, error } =
          await getSyncQueueService().getFailedSyncQueueItems();
        if (error) {
          set({ error: errorMessage(error) });
          return [];
        }
        return data ?? [];
      },

      getMetrics: async () => {
        const { data, error } =
          await getSyncQueueService().getSyncQueueMetrics();
        if (error) {
          set({ error: errorMessage(error) });
          return {
            totalPending: 0,
            totalFailed: 0,
            devicesWithIssues: 0,
            oldestPendingAge: null,
          };
        }
        return data!;
      },

      subscribeToSyncQueue: () => {
        getSyncQueueService().subscribeToSyncQueue({
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
        getSyncQueueService().unsubscribeFromSyncQueue();
      },
    }),
    { name: "SyncQueueStore" },
  ),
);
