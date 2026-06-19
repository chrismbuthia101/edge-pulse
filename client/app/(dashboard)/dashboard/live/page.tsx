"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  AlertTriangle,
  MonitorSmartphone,
  Lock,
  Filter,
  RefreshCw,
  Download,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLiveStore } from "@/lib/stores/live-store";

export default function LivePage() {
  useEffect(() => {
    document.title = "Live Feed - EdgePulse";
  }, []);

  const {
    events,
    filter,
    paused,
    connected,
    todayStats,
    initialize,
    setFilter,
    setPaused,
    exportCSV,
  } = useLiveStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const iconMap = {
    AlertTriangle,
    Shield,
    MonitorSmartphone,
    Lock,
  };

  const severityColor: Record<string, string> = {
    critical: "text-destructive bg-destructive/10 border-destructive/25",
    high: "text-orange-500 bg-orange-500/10 border-orange-500/25",
    medium: "text-amber-500 bg-amber-500/10 border-amber-500/25",
    info: "text-primary bg-primary/10 border-primary/25",
    ok: "text-green-500 bg-green-500/10 border-green-500/25",
  };

  const eventTypes: readonly ["all", "anomaly", "auth", "device", "ok"] = [
    "all",
    "anomaly",
    "auth",
    "device",
    "ok",
  ];

  const filtered =
    filter === "all" ? events : events.filter((e) => e.type === filter);

  return (
    <div className="max-w-300 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Live Event Feed
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time security events across all devices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setPaused(!paused)}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${!paused && connected ? "animate-spin" : ""}`}
              style={{ animationDuration: "3s" }}
            />
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={exportCSV}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Events Today",
            value:
              todayStats.total > 0 ? todayStats.total.toLocaleString() : "—",
            color: "text-foreground",
          },
          {
            label: "Critical",
            value:
              todayStats.critical > 0 ? todayStats.critical.toString() : "—",
            color: "text-destructive",
          },
          {
            label: "Blocked",
            value:
              todayStats.blocked > 0
                ? todayStats.blocked.toLocaleString()
                : "—",
            color: "text-green-500",
          },
          {
            label: "Stream",
            value: connected ? "Live" : "Offline",
            color: connected ? "text-green-500" : "text-destructive",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-card border border-border rounded-xl p-4"
          >
            <p className={`text-xl font-bold font-display ${s.color}`}>
              {s.value}
            </p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Live indicator + filters */}
      <div className="flex items-center justify-between">
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${
            connected && !paused
              ? "bg-green-500/10 border-green-500/20"
              : paused
                ? "bg-amber-500/10 border-amber-500/20"
                : "bg-destructive/10 border-destructive/20"
          }`}
        >
          {connected && !paused ? (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          ) : paused ? (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          ) : (
            <WifiOff className="h-3 w-3 text-destructive" />
          )}
          <span
            className={`text-xs font-medium ${
              connected && !paused
                ? "text-green-600 dark:text-green-400"
                : paused
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-destructive"
            }`}
          >
            {connected && !paused
              ? "Streaming Live"
              : paused
                ? "Stream Paused"
                : "Connecting…"}
          </span>
        </div>
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground ml-2" />
          {eventTypes.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                filter === t
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Event stream */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="divide-y divide-border max-h-150 overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {filtered.map((ev) => {
              const IconComponent = iconMap[ev.iconName];
              return (
                <motion.div
                  key={ev.id}
                  layout
                  initial={{
                    opacity: 0,
                    y: -20,
                    backgroundColor: "hsl(var(--primary) / 0.05)",
                  }}
                  animate={{ opacity: 1, y: 0, backgroundColor: "transparent" }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors"
                >
                  <div
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${ev.bg}`}
                  >
                    <IconComponent className={`h-3.5 w-3.5 ${ev.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {ev.title}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {ev.device}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${
                      severityColor[ev.severity] ?? severityColor.info
                    }`}
                  >
                    {ev.severity}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground/60 shrink-0 w-20 text-right">
                    {ev.time}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm">
              {connected
                ? "No events matching this filter."
                : "Connecting to live stream…"}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} events
          </p>
          <div
            className={`flex items-center gap-1 text-xs ${connected ? "text-green-500" : "text-muted-foreground"}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`}
            />
            {connected ? "Supabase Realtime" : "Offline"}
          </div>
        </div>
      </div>
    </div>
  );
}
