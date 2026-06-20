import { create } from "zustand";
import { LiveRepository } from "@/lib/repositories";
import { LiveService } from "@/lib/services/live-service";
import type { Alert, TelemetryEvent } from "@/lib/supabase/types";
import { toast } from "sonner";

type EventType = "all" | "anomaly" | "auth" | "device" | "ok";

interface LiveEvent {
  id: string;
  type: EventType;
  iconName: "AlertTriangle" | "Shield" | "MonitorSmartphone" | "Lock";
  color: string;
  bg: string;
  title: string;
  device: string;
  time: string;
  severity: string;
  rawCreatedAt: string;
}

interface LiveStore {
  events: LiveEvent[];
  filter: EventType;
  paused: boolean;
  connected: boolean;
  todayStats: {
    total: number;
    critical: number;
    blocked: number;
  };
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  setFilter: (filter: EventType) => void;
  setPaused: (paused: boolean) => void;
  clearError: () => void;
  exportCSV: () => void;

  addAlertEvent: (alert: Alert) => void;
  addTelemetryEvent: (telemetry: TelemetryEvent) => void;
  setConnected: (connected: boolean) => void;
}

function alertToLiveEvent(alert: Alert): LiveEvent {
  const severity = alert.severity;
  const isCritical = severity === "critical";
  const isHigh = severity === "high";
  const isThreat = isCritical || isHigh;
  const source = alert.telemetry_source ?? "";
  const isAuth = source === "PROCESS" && !isThreat;

  return {
    id: alert.id,
    type: isThreat ? "anomaly" : isAuth ? "auth" : "ok",
    iconName: isThreat ? "AlertTriangle" : isAuth ? "Lock" : "Shield",
    color: isCritical
      ? "text-destructive"
      : isHigh
        ? "text-orange-500"
        : isAuth
          ? "text-amber-500"
          : "text-green-500",
    bg: isCritical
      ? "bg-destructive/10 border-destructive/20"
      : isHigh
        ? "bg-orange-500/10 border-orange-500/20"
        : isAuth
          ? "bg-amber-500/10 border-amber-500/20"
          : "bg-green-500/10 border-green-500/20",
    title: alert.title ?? "Security event",
    device: alert.device_id,
    time: new Date(alert.created_at).toLocaleTimeString(),
    severity: severity === "low" ? "info" : severity,
    rawCreatedAt: alert.created_at,
  };
}

function telemetryToLiveEvent(telemetry: TelemetryEvent): LiveEvent {
  const isDevice = telemetry.source === "RESOURCE";
  return {
    id: telemetry.id,
    type: isDevice ? "device" : "ok",
    iconName: isDevice ? "MonitorSmartphone" : "Shield",
    color: isDevice ? "text-primary" : "text-green-500",
    bg: isDevice
      ? "bg-primary/10 border-primary/20"
      : "bg-green-500/10 border-green-500/20",
    title: `Telemetry received (${telemetry.source})`,
    device: telemetry.device_id,
    time: new Date(telemetry.collected_at).toLocaleTimeString(),
    severity: "info",
    rawCreatedAt: telemetry.collected_at,
  };
}

const liveRepository = new LiveRepository();
const liveService = new LiveService(liveRepository);

export const useLiveStore = create<LiveStore>((set, get) => ({
  events: [],
  filter: "all",
  paused: false,
  connected: false,
  todayStats: { total: 0, critical: 0, blocked: 0 },
  loading: false,
  error: null,

  initialize: async () => {
    try {
      set({ loading: true, error: null });

      const { alerts, telemetry, stats } =
        await liveService.initializeLiveFeed();

      const alertEvents = alerts.map(alertToLiveEvent);
      const telemetryEvents = telemetry
        .filter((t) => t.source === "RESOURCE") // Only show device telemetry
        .map(telemetryToLiveEvent);

      const allEvents = [...alertEvents, ...telemetryEvents]
        .sort(
          (a, b) =>
            new Date(b.rawCreatedAt).getTime() -
            new Date(a.rawCreatedAt).getTime(),
        )
        .slice(0, 100);

      set({
        events: allEvents,
        todayStats: stats,
        loading: false,
      });

      liveService.subscribeToLiveFeed({
        onNewAlert: (alert) => {
          if (!get().paused) {
            get().addAlertEvent(alert);
          }
        },
        onNewTelemetry: (telemetry) => {
          if (!get().paused && telemetry.source === "RESOURCE") {
            get().addTelemetryEvent(telemetry);
          }
        },
        onStatusChange: (connected) => {
          get().setConnected(connected);
        },
        onError: (error) => {
          console.error("[LiveStore] Realtime error:", error);
          set({ error: error.message });
        },
      });
    } catch (err) {
      const error =
        err instanceof Error ? err.message : "Failed to initialize live feed";
      set({ error, loading: false });
    }
  },

  setFilter: (filter) => set({ filter }),

  setPaused: (paused) => set({ paused }),

  clearError: () => set({ error: null }),

  exportCSV: () => {
    const { events, filter } = get();
    const filtered =
      filter === "all" ? events : events.filter((e) => e.type === filter);

    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

    const rows = [
      ["Time", "Title", "Device", "Severity", "Type"],
      ...filtered.map((e) => [
        esc(new Date(e.rawCreatedAt).toISOString()),
        esc(e.title),
        esc(e.device),
        esc(e.severity),
        esc(e.type),
      ]),
    ];

    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edgepulse-live-feed-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Live feed exported as CSV");
  },

  addAlertEvent: (alert) => {
    const event = alertToLiveEvent(alert);
    set((state) => ({
      events: [event, ...state.events.slice(0, 99)],
      todayStats: {
        ...state.todayStats,
        total: state.todayStats.total + 1,
        critical:
          state.todayStats.critical + (alert.severity === "critical" ? 1 : 0),
      },
    }));
  },

  addTelemetryEvent: (telemetry) => {
    const event = telemetryToLiveEvent(telemetry);
    set((state) => ({
      events: [event, ...state.events.slice(0, 99)],
    }));
  },

  setConnected: (connected) => set({ connected }),
}));

export { liveService, liveRepository };
