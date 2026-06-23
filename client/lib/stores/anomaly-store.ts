import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AnomalyService } from "@/lib/services/anomaly-service";
import { AnomalyRepository } from "@/lib/repositories/anomaly-repository";
import type { AnomalyScore, AnomalyAnalytics } from "@/lib/types/anomaly";
import { createClient } from "@/lib/config/client";

type Status = "idle" | "loading" | "success" | "error";

let anomalyService = new AnomalyService(new AnomalyRepository(createClient()));

const initialState = {
  scores: [] as AnomalyScore[],
  latestScore: null as AnomalyScore | null,
  analytics: null as AnomalyAnalytics | null,
  status: "idle" as Status,
  error: null as string | null,
};

type AnomalyStore = typeof initialState & {
  initialize: (supabaseClient: SupabaseClient) => void;
  refreshScores: (deviceId: string, limit?: number) => Promise<void>;
  refreshLatestScore: (deviceId: string) => Promise<void>;
  refreshAnalytics: (deviceId: string, timeframe?: "24h" | "7d" | "30d") => Promise<void>;
  clearError: () => void;
};

export const useAnomalyStore = create<AnomalyStore>()(
  devtools(
    (set) => ({
      ...initialState,

      initialize: (supabaseClient: SupabaseClient) => {
        anomalyService = new AnomalyService(new AnomalyRepository(supabaseClient));
      },

      refreshScores: async (deviceId, limit = 20) => {
        set({ status: "loading", error: null });

        const result = await anomalyService.getDeviceAnomalyHistory(deviceId, limit);
        if (!result.success) {
          set({ error: result.error, status: "error" });
          return;
        }

        set({ scores: result.data, status: "success" });
      },

      refreshLatestScore: async (deviceId) => {
        set({ status: "loading", error: null });

        const result = await anomalyService.getLatestAnomalyScore(deviceId);
        if (!result.success) {
          set({ error: result.error, status: "error" });
          return;
        }

        set({ latestScore: result.data, status: "success" });
      },

      refreshAnalytics: async (deviceId, timeframe = "24h") => {
        set({ status: "loading", error: null });

        const result = await anomalyService.getAnomalyAnalytics(deviceId, timeframe);
        if (!result.success) {
          set({ error: result.error, status: "error" });
          return;
        }

        set({ analytics: result.data, status: "success" });
      },

      clearError: () => set({ error: null }),
    }),
    { name: "AnomalyStore" },
  ),
);
