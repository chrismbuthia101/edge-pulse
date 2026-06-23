import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HealthService } from "@/lib/services/health-service";
import { HealthRepository } from "@/lib/repositories/health-repository";
import { TelemetryService } from "@/lib/services/telemetry-service";
import type { TelemetrySample } from "@/lib/services/telemetry-service";
import { ResilienceService } from "@/lib/services/resilience-service";
import type { ConnectionMetrics } from "@/lib/repositories/resilience-repository";
import type { DeviceHealthSnapshot, SystemHealth } from "@/lib/types/health";
import { createClient } from "@/lib/config/client";

type Status = "idle" | "loading" | "success" | "error";

let healthService = new HealthService(new HealthRepository(createClient()));
const telemetryService = new TelemetryService(createClient());
const resilienceService = new ResilienceService(createClient());
let healthCleanup: (() => void) | null = null;

const initialState = {
  devices: [] as DeviceHealthSnapshot[],
  systemHealth: null as SystemHealth | null,
  telemetry: {} as Record<string, TelemetrySample[]>,
  connectionMetrics: {} as Record<string, ConnectionMetrics>,
  status: "idle" as Status,
  error: null as string | null,
};

type HealthStore = typeof initialState & {
  initialize: (supabaseClient: SupabaseClient) => void;
  refreshHealthData: () => Promise<void>;
  setDevices: (devices: DeviceHealthSnapshot[]) => void;
  setSystemHealth: (systemHealth: SystemHealth | null) => void;
  clearError: () => void;
  getDeviceById: (deviceId: string) => DeviceHealthSnapshot | null;
  getSystemMetrics: () => Promise<SystemHealth | null>;
  subscribeToHealthUpdates: () => void;
  unsubscribeFromHealthUpdates: () => void;
  fetchTelemetry: (deviceId: string, limit?: number) => Promise<void>;
  fetchConnectionMetrics: (deviceId: string) => Promise<void>;
};

export const useHealthStore = create<HealthStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      initialize: (supabaseClient: SupabaseClient) => {
        healthService = new HealthService(new HealthRepository(supabaseClient));
      },

      refreshHealthData: async () => {
        set({ status: "loading", error: null });

        const devicesResult = await healthService.getDeviceHealth({ limit: 100 });
        if (!devicesResult.success) {
          set({ error: devicesResult.error, status: "error" });
          return;
        }

        const systemResult = await healthService.getSystemHealth();
        if (!systemResult.success) {
          set({ error: systemResult.error, status: "error" });
          return;
        }

        set({
          devices: devicesResult.data,
          systemHealth: systemResult.data,
          status: "success",
        });
      },

      setDevices: (devices) => set({ devices }),

      setSystemHealth: (systemHealth) => set({ systemHealth }),

      clearError: () => set({ error: null }),

      getDeviceById: (deviceId) => {
        return get().devices.find((d) => d.device_id === deviceId) || null;
      },

      getSystemMetrics: async () => {
        const result = await healthService.getSystemHealth();
        if (!result.success) {
          set({ error: result.error });
          return null;
        }
        set({ systemHealth: result.data });
        return result.data;
      },

      fetchTelemetry: async (deviceId, limit = 48) => {
        const result = await telemetryService.getLatestTelemetry(
          deviceId,
          limit,
        );
        if (result.data) {
          const samples: TelemetrySample[] = result.data;
          set((state) => ({
            telemetry: { ...state.telemetry, [deviceId]: samples },
          }));
        }
      },

      fetchConnectionMetrics: async (deviceId) => {
        const result = await resilienceService.getConnectionMetrics();
        const metrics =
          result.data?.find((m) => m.device_id === deviceId) ?? null;
        if (metrics) {
          set((state) => ({
            connectionMetrics: {
              ...state.connectionMetrics,
              [deviceId]: metrics,
            },
          }));
        }
      },

      subscribeToHealthUpdates: () => {
        if (healthCleanup) return;

        healthCleanup = healthService.subscribeToHealthUpdates({
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
        if (healthCleanup) {
          healthCleanup();
          healthCleanup = null;
        }
      },
    }),
    { name: "HealthStore" },
  ),
);
