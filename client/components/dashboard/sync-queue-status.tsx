"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Database, Clock, CheckCircle2, AlertTriangle, Wifi, WifiOff, Activity, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface SyncQueueMetrics {
  totalQueued: number;
  pendingSync: number;
  syncingNow: number;
  lastSync: string;
  syncSuccessRate: number;
  avgSyncTime: string;
  dataLossEvents: number;
  offlineDevices: number;
  onlineDevices: number;
}

interface SyncRecord {
  id: string;
  type: "telemetry" | "alert" | "log";
  status: "pending" | "syncing" | "completed" | "failed";
  timestamp: string;
  size: string;
  deviceId: string;
}

export function SyncQueueStatus() {
  const [metrics, setMetrics] = useState<SyncQueueMetrics>({
    totalQueued: 1247,
    pendingSync: 89,
    syncingNow: 12,
    lastSync: "3m ago",
    syncSuccessRate: 99.7,
    avgSyncTime: "280ms",
    dataLossEvents: 0,
    offlineDevices: 3,
    onlineDevices: 8
  });

  const recentRecords: SyncRecord[] = [
    { id: "1", type: "alert", status: "syncing", timestamp: "2m ago", size: "2.1KB", deviceId: "dev-laptop-07" },
    { id: "2", type: "telemetry", status: "pending", timestamp: "5m ago", size: "15.3KB", deviceId: "srv-db-02" },
    { id: "3", type: "log", status: "completed", timestamp: "8m ago", size: "8.7KB", deviceId: "ws-finance-03" },
    { id: "4", type: "alert", status: "pending", timestamp: "12m ago", size: "1.9KB", deviceId: "gw-primary" },
    { id: "5", type: "telemetry", status: "syncing", timestamp: "15m ago", size: "22.4KB", deviceId: "dev-laptop-07" },
  ];

  // Simulate real-time updates for demonstration
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => ({
        ...prev,
        totalQueued: prev.totalQueued + Math.floor(Math.random() * 3),
        pendingSync: Math.max(0, prev.pendingSync + Math.floor(Math.random() * 2) - 1),
        syncingNow: Math.max(0, prev.syncingNow + Math.floor(Math.random() * 3) - 1),
        lastSync: Math.random() > 0.7 ? "Just now" : prev.lastSync,
        syncSuccessRate: Math.min(100, Math.max(95, prev.syncSuccessRate + (Math.random() - 0.5) * 0.2))
      }));
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-500 bg-green-500/10 border-green-500/20";
      case "syncing":
        return "text-blue-500 bg-blue-500/10 border-blue-500/20";
      case "pending":
        return "text-amber-500 bg-amber-500/10 border-amber-500/20";
      case "failed":
        return "text-red-500 bg-red-500/10 border-red-500/20";
      default:
        return "text-muted-foreground bg-muted/30 border-border";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "alert":
        return <AlertTriangle className="h-3 w-3" />;
      case "telemetry":
        return <Activity className="h-3 w-3" />;
      case "log":
        return <Database className="h-3 w-3" />;
      default:
        return <Database className="h-3 w-3" />;
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">Sync Queue Status</h3>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 text-xs min-w-0">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-muted-foreground">Offline Operation Active</span>
        </div>
      </div>

      {/* Queue Metrics */}
      <div className="p-4 lg:p-5 space-y-4">
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
            <p className="text-lg font-bold text-foreground">{metrics.totalQueued.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total records</p>
            <div className="flex items-center gap-1 mt-1">
              {metrics.totalQueued > 1000 ? <ArrowUpRight className="h-3 w-3 text-red-500" /> : <ArrowDownRight className="h-3 w-3 text-green-500" />}
              <span className="text-[9px] text-muted-foreground">Queue size</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg"
          >
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-medium text-amber-500">Pending</span>
            </div>
            <p className="text-lg font-bold text-foreground">{metrics.pendingSync}</p>
            <p className="text-xs text-muted-foreground">Awaiting sync</p>
            <div className="flex items-center gap-1 mt-1">
              <span className={`text-[9px] ${metrics.pendingSync < 100 ? 'text-green-500' : 'text-amber-500'}`}>
                {metrics.pendingSync < 100 ? 'Normal' : 'High'}
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg"
          >
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-xs font-medium text-green-500">Success Rate</span>
            </div>
            <p className="text-lg font-bold text-foreground">{metrics.syncSuccessRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Last 24h</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[9px] text-green-500">Excellent</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg"
          >
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-violet-500" />
              <span className="text-xs font-medium text-violet-500">Avg Sync</span>
            </div>
            <p className="text-lg font-bold text-foreground">{metrics.avgSyncTime}</p>
            <p className="text-xs text-muted-foreground">Per record</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[9px] text-violet-500">Fast</span>
            </div>
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
              <p className="text-sm font-bold text-foreground">{metrics.onlineDevices}</p>
              <p className="text-xs text-muted-foreground">Online devices</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <WifiOff className="h-4 w-4 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">{metrics.offlineDevices}</p>
              <p className="text-xs text-muted-foreground">Offline devices</p>
            </div>
          </div>
        </motion.div>

        {/* Recent Sync Activity */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <h4 className="text-xs font-medium text-muted-foreground mb-3">Recent Sync Activity</h4>
          <div className="space-y-2">
            {recentRecords.map((record, index) => (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + index * 0.1 }}
                className={`flex items-center gap-3 p-2 rounded-lg border ${getStatusColor(record.status)}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {getTypeIcon(record.type)}
                  <span className="text-xs font-medium text-foreground truncate">{record.type}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{record.deviceId}</p>
                  <p className="text-[9px] text-muted-foreground">{record.timestamp} · {record.size}</p>
                </div>
                <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full border ${getStatusColor(record.status)}`}>
                  {record.status}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Data Loss Prevention Status */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border"
        >
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>Sync Active</span>
            </div>
            <span>·</span>
            <span>Last sync: {metrics.lastSync}</span>
            <span>·</span>
            <span className="text-green-500 font-medium">{metrics.dataLossEvents} data loss events</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{metrics.syncingNow} syncing now</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
