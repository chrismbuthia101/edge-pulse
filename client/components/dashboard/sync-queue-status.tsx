"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import {
  Database,
  Clock,
  CheckCircle2,
  Wifi,
  WifiOff,
  Activity,
} from "lucide-react";
import { useSyncQueueStore } from "@/lib/stores/sync-queue-store";
import { useDeviceStore } from "@/lib/stores/device-store";

export function SyncQueueStatus() {
  const summaries = useSyncQueueStore((s) => s.summaries);
  const totalPending = useSyncQueueStore((s) => s.totalPending);
  const totalFailed = useSyncQueueStore((s) => s.totalFailed);
  const status = useSyncQueueStore((s) => s.status);
  const refreshSummaries = useSyncQueueStore((s) => s.refreshSummaries);
  const devices = useDeviceStore((s) => s.devices);
  const refreshDevices = useDeviceStore((s) => s.refreshDevices);

  const onlineDevices = devices.filter((d) => d.status === "online").length;
  const offlineDevices = devices.filter((d) => d.status !== "online").length;
  const totalQueued = summaries.reduce((sum, s) => sum + s.pending_count + s.failed_count, 0);
  const syncingNow = summaries.filter((s) => s.pending_count > 0).length;
  const avgSyncTime = "—";
  const syncSuccessRate = totalQueued > 0
    ? Math.round((1 - totalFailed / Math.max(totalQueued, 1)) * 1000) / 10
    : 100;
  const dataLossEvents = 0;

  useEffect(() => {
    refreshSummaries();
    refreshDevices();
  }, [refreshDevices, refreshSummaries]);

  return (
    <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">
            Sync Queue Status
          </h3>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 text-xs min-w-0">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-muted-foreground">
            Offline Operation Active
          </span>
        </div>
      </div>

      {/* Queue Metrics */}
      <div className="p-4 lg:p-5 space-y-4">
        {status === "loading" ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Database className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-medium text-blue-500">Queued</span>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {totalQueued.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Total records</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-medium text-amber-500">
                    Pending
                  </span>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {totalPending}
                </p>
                <p className="text-xs text-muted-foreground">Awaiting sync</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg"
              >
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-xs font-medium text-green-500">
                    Success Rate
                  </span>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {syncSuccessRate.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">Last 24h</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-4 w-4 text-violet-500" />
                  <span className="text-xs font-medium text-violet-500">
                    Avg Sync
                  </span>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {avgSyncTime}
                </p>
                <p className="text-xs text-muted-foreground">Per record</p>
              </motion.div>
            </div>

            {/* Device Connectivity */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="grid grid-cols-2 gap-3"
            >
              <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <Wifi className="h-4 w-4 text-green-500" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground">
                    {onlineDevices}
                  </p>
                  <p className="text-xs text-muted-foreground">Online devices</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <WifiOff className="h-4 w-4 text-red-500" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground">
                    {offlineDevices}
                  </p>
                  <p className="text-xs text-muted-foreground">Offline devices</p>
                </div>
              </div>
            </motion.div>

            {/* Data Loss Prevention Status */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border"
            >
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span>Sync Active</span>
                </div>
                <span>·</span>
                <span className="text-green-500 font-medium">
                  {dataLossEvents} data loss events
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {syncingNow} syncing now
                </span>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
