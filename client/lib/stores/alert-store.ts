import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertService } from "@/lib/services/alert-service";
import { AlertRepository } from "@/lib/repositories/alert-repository";
import type { Alert, AlertStatus } from "@/lib/types/alerts";
import { toast } from "sonner";
import { createClient } from "@/lib/config/client";

type Status = "idle" | "loading" | "success" | "error";

let alertService = new AlertService(new AlertRepository(createClient()));
let alertCleanup: (() => void) | null = null;

function deriveCounters(alerts: Alert[]) {
  return {
    pendingCount: alerts.filter((a) => a.status === "PENDING").length,
    unreadCount: alerts.filter((a) => !a.read && a.status !== "CLOSED").length,
  };
}

const initialState = {
  alerts: [] as Alert[],
  pendingCount: 0,
  unreadCount: 0,
  status: "idle" as Status,
  error: null as string | null,
};

type AlertStore = typeof initialState & {
  initialize: (supabaseClient?: SupabaseClient) => void;
  refreshAlerts: () => Promise<void>;
  fetchAlerts: () => Promise<void>;
  addAlert: (alert: Alert) => void;
  updateAlert: (id: string, updates: Partial<Alert>) => void;
  updateAlertStatus: (id: string, status: AlertStatus, userId?: string) => Promise<void>;
  markRead: (id: string) => void;
  markMultipleRead: (ids: string[]) => Promise<void>;
  setAlerts: (alerts: Alert[]) => void;
  clearError: () => void;
  bulkUpdateStatus: (ids: string[], status: AlertStatus, userId?: string) => Promise<void>;
  bulkAcknowledge: (ids: string[], userId?: string) => Promise<void>;
  bulkClose: (ids: string[], userId?: string) => Promise<void>;
  searchAlerts: (query: string) => Promise<Alert[]>;
  getAlertsByDevice: (deviceId: string) => Promise<Alert[]>;
  getCriticalAlerts: () => Promise<Alert[]>;
  getAlertById: (id: string) => Promise<Alert | null>;
  getMetrics: () => Promise<unknown>;
  subscribeToAlerts: () => void;
  unsubscribeFromAlerts: () => void;
};

export const useAlertStore = create<AlertStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      initialize: (supabaseClient) => {
        const client = supabaseClient ?? createClient();
        alertService = new AlertService(new AlertRepository(client));
      },

      refreshAlerts: async () => {
        await get().fetchAlerts();
      },

      fetchAlerts: async () => {
        set({ status: "loading" });
        const result = await alertService.getAlertsPaginated({
          page: 1,
          limit: 100,
        });
        if (!result.success) {
          set({ error: result.error, status: "error" });
        } else {
          set({
            alerts: result.data.alerts,
            ...deriveCounters(result.data.alerts),
            status: "success",
          });
        }
      },

      addAlert: (alert) => {
        set((state) => {
          const alerts = [alert, ...state.alerts];
          return { alerts, ...deriveCounters(alerts) };
        });
      },

      updateAlert: (id, updates) => {
        set((state) => {
          const alerts = state.alerts.map((a) =>
            a.id === id ? { ...a, ...updates } : a,
          );
          return { alerts, ...deriveCounters(alerts) };
        });
      },

      setAlerts: (alerts) => {
        set({ alerts, ...deriveCounters(alerts) });
      },

      markRead: (id) => {
        set((state) => {
          const alerts = state.alerts.map((a) =>
            a.id === id ? { ...a, read: true } : a,
          );
          return { alerts, ...deriveCounters(alerts) };
        });
      },

      clearError: () => set({ error: null }),

      updateAlertStatus: async (id, status, userId) => {
        const previous = get().alerts.find((a) => a.id === id);

        get().updateAlert(id, { status });

        const result = await alertService.updateAlertStatus(id, status, userId);
        if (!result.success) {
          if (previous) get().updateAlert(id, { status: previous.status });
          set({ error: result.error });
        }
      },

      markMultipleRead: async (ids) => {
        ids.forEach((id) => get().markRead(id));

        const result = await alertService.bulkMarkAlertsRead(ids);
        if (!result.success) {
          set({ error: result.error });
        }
      },

      bulkUpdateStatus: async (ids, status, userId) => {
        const previousAlerts = get().alerts;
        ids.forEach((id) => get().updateAlert(id, { status }));

        const result = await alertService.bulkUpdateStatus(ids, status, userId);
        if (!result.success) {
          set({ alerts: previousAlerts, error: result.error });
        }
      },

      bulkAcknowledge: (ids, userId) =>
        get().bulkUpdateStatus(ids, "ACKNOWLEDGED", userId),

      bulkClose: (ids, userId) => get().bulkUpdateStatus(ids, "CLOSED", userId),

      searchAlerts: async (query) => {
        const result = await alertService.getAlerts({ search: query });
        if (!result.success) {
          set({ error: result.error });
          return [];
        }
        return result.data ?? [];
      },

      getAlertsByDevice: async (deviceId) => {
        const result = await alertService.getAlerts({ deviceId });
        if (!result.success) {
          set({ error: result.error });
          return [];
        }
        return result.data ?? [];
      },

      getCriticalAlerts: async () => {
        const result = await alertService.getCriticalAlerts();
        if (!result.success) {
          set({ error: result.error });
          return [];
        }
        return result.data ?? [];
      },

      getAlertById: async (id: string) => {
        const result = await alertService.getAlertById(id);
        if (!result.success) {
          set({ error: result.error });
          return null;
        }
        return result.data;
      },

      getMetrics: async () => {
        const result = await alertService.getMetrics();
        if (!result.success) {
          set({ error: result.error });
          return null;
        }
        return result.data;
      },

      subscribeToAlerts: () => {
        alertCleanup = alertService.subscribeToAlerts({
          onNewAlert: (alert) => {
            get().addAlert(alert);

            if (alert.severity === "critical") {
              toast.error(`Critical Alert: ${alert.title}`, {
                action: {
                  label: "View",
                  onClick: () => {
                    window.location.href = `/dashboard/alerts/${alert.id}`;
                  },
                },
              });
            }
          },
          onAlertUpdated: (alert) => {
            get().updateAlert(alert.id, alert);
          },
          onAlertClosed: (alert) => {
            get().updateAlert(alert.id, alert);
          },
          onError: (error) => {
            console.error("[AlertStore] Realtime error:", error);
          },
        });
      },

      unsubscribeFromAlerts: () => {
        if (alertCleanup) {
          alertCleanup();
          alertCleanup = null;
        }
      },
    }),
    { name: "AlertStore" },
  ),
);
