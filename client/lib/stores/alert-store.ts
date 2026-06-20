import { create } from "zustand";
import { AlertRepository } from "@/lib/repositories";
import { AlertService } from "@/lib/services/alert-service";
import type { Alert, AlertStatus } from "@/lib/supabase/types";
import { errorMessage } from "@/lib/utils/error";
import { toast } from "sonner";

interface AlertStore {
  alerts: Alert[];
  pendingCount: number;
  unreadCount: number;
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  refreshAlerts: () => Promise<void>;
  refreshAlertsForUser: (userId?: string, isAdmin?: boolean) => Promise<void>;
  fetchAlerts: () => Promise<void>;
  addAlert: (alert: Alert) => void;
  updateAlert: (id: string, updates: Partial<Alert>) => void;
  updateAlertStatus: (
    id: string,
    status: AlertStatus,
    userId?: string,
  ) => Promise<void>;
  markRead: (id: string) => void;
  markMultipleRead: (ids: string[]) => Promise<void>;
  setAlerts: (alerts: Alert[]) => void;
  clearError: () => void;

  bulkUpdateStatus: (
    ids: string[],
    status: AlertStatus,
    userId?: string,
  ) => Promise<void>;
  bulkAcknowledge: (ids: string[], userId?: string) => Promise<void>;
  bulkClose: (ids: string[], userId?: string) => Promise<void>;

  searchAlerts: (query: string) => Promise<Alert[]>;
  getAlertsByDevice: (deviceId: string) => Promise<Alert[]>;
  getCriticalAlerts: () => Promise<Alert[]>;
  getAlertById: (id: string) => Promise<Alert | null>;
  getMetrics: () => Promise<unknown>;

  subscribeToAlerts: () => void;
  unsubscribeFromAlerts: () => void;
}

const alertRepository = new AlertRepository();
const alertService = new AlertService(alertRepository);

function deriveCounters(
  alerts: Alert[],
): Pick<AlertStore, "pendingCount" | "unreadCount"> {
  return {
    pendingCount: alerts.filter((a) => a.status === "PENDING").length,
    unreadCount: alerts.filter((a) => !a.read && a.status !== "CLOSED").length,
  };
}

export const useAlertStore = create<AlertStore>((set, get) => ({
 
  alerts: [],
  pendingCount: 0,
  unreadCount: 0,
  loading: false,
  error: null,

  initialize: async () => {
    await get().fetchAlerts();
    get().subscribeToAlerts();
  },

  refreshAlerts: async () => {
    await get().fetchAlerts();
  },

  /** @deprecated Use refreshAlerts() — alerts are not user-scoped. */
  refreshAlertsForUser: async () => {
    await get().refreshAlerts();
  },

  fetchAlerts: async () => {
    try {
      set({ loading: true, error: null });
      const result = await alertService.getAlertsPaginated({
        page: 1,
        limit: 100,
      });
      set({
        alerts: result.alerts,
        ...deriveCounters(result.alerts),
        loading: false,
      });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
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

    // Optimistic update
    get().updateAlert(id, { status });

    try {
      await alertService.updateAlertStatus(id, status, { userId });
    } catch (err) {
      // Rollback
      if (previous) get().updateAlert(id, { status: previous.status });
      set({ error: errorMessage(err) });
    }
  },

  markMultipleRead: async (ids) => {
    ids.forEach((id) => get().markRead(id));

    try {
      await alertService.bulkUpdateAlerts({
        alertIds: ids,
        operation: "mark_read",
      });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  bulkUpdateStatus: async (ids, status, userId) => {
    const previousAlerts = get().alerts;
    ids.forEach((id) => get().updateAlert(id, { status }));

    const operation =
      status === "ACKNOWLEDGED"
        ? "acknowledge"
        : status === "INVESTIGATED"
          ? "investigate"
          : "close";

    try {
      await alertService.bulkUpdateAlerts({
        alertIds: ids,
        operation,
        options: { userId },
      });
    } catch (err) {
      set({ alerts: previousAlerts, error: errorMessage(err) });
    }
  },

  bulkAcknowledge: (ids, userId) =>
    get().bulkUpdateStatus(ids, "ACKNOWLEDGED", userId),

  bulkClose: (ids, userId) => get().bulkUpdateStatus(ids, "CLOSED", userId),

  searchAlerts: async (query) => {
    try {
      return await alertService.searchAlerts(query);
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getAlertsByDevice: async (deviceId) => {
    try {
      return await alertService.getAlerts({ deviceId });
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getCriticalAlerts: async () => {
    try {
      return await alertService.getCriticalAlerts();
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getAlertById: async (id: string) => {
    try {
      return await alertService.getAlertById(id);
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  getMetrics: async () => {
    try {
      return await alertService.getMetrics();
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  subscribeToAlerts: () => {
    alertService.subscribeToAlerts({
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
    alertService.unsubscribeFromAlerts();
  },
}));

export { alertService, alertRepository };
