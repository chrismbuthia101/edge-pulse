"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Wifi, WifiOff, Activity, TrendingUp, AlertTriangle } from "lucide-react";
import { useAlertStore } from "@/stores/alert-store";
import { useDeviceStore } from "@/stores/device-store";

interface TimeSeriesData {
  time: string;
  online: number;
  offline: number;
  total: number;
  onlineRate: number;
  detectionCount: number;
}

interface TimeSeriesTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: {
      time: string;
      online: number;
      offline: number;
      detectionCount: number;
      onlineRate: number;
    };
  }>;
}

const TimeSeriesTooltip = ({ active, payload }: TimeSeriesTooltipProps) => {
  if (active && payload && payload[0]) {
    const data = payload[0].payload;
    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold text-sm mb-2">{data.time}</p>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Online: {data.online} devices
          </p>
          <p className="text-xs text-muted-foreground">
            Offline: {data.offline} devices
          </p>
          <p className="text-xs text-muted-foreground">
            Detections: {data.detectionCount}
          </p>
          <p className="text-xs text-muted-foreground">
            Online Rate: {data.onlineRate}%
          </p>
        </div>
      </div>
    );
  }
  return null;
};

export function OnlineOfflineDetection() {
  const alerts = useAlertStore((s) => s.alerts);
  const devices = useDeviceStore((s) => s.devices);

  // Generate time series data for the last 24 hours
  const timeSeriesData = useMemo(() => {
    const data: TimeSeriesData[] = [];
    const now = new Date().getTime();

    for (let i = 23; i >= 0; i--) {
      const hourStart = now - (i * 60 * 60 * 1000);
      const hourEnd = hourStart + (60 * 60 * 1000);

      // Count devices by status in this hour
      const onlineDevices = devices.filter(d =>
        d.status === 'online' ||
        (d.last_seen && new Date(d.last_seen).getTime() >= hourStart)
      ).length;

      const offlineDevices = devices.filter(d =>
        d.status === 'offline' || d.status === 'gone_silent' || d.status === 'unsynced'
      ).length;

      const totalDevices = Math.max(onlineDevices + offlineDevices, 1);

      // Count detections in this hour
      const hourDetections = alerts.filter(a => {
        const alertTime = new Date(a.created_at).getTime();
        return alertTime >= hourStart && alertTime < hourEnd;
      }).length;

      const onlineRate = totalDevices > 0 ? (onlineDevices / totalDevices) * 100 : 0;

      data.push({
        time: i === 0 ? 'Now' : i <= 12 ? `${i}h ago` : `${24 - i}am`,
        online: onlineDevices,
        offline: offlineDevices,
        total: totalDevices,
        onlineRate: Math.round(onlineRate),
        detectionCount: hourDetections,
      });
    }

    return data;
  }, [alerts, devices]);

  // Calculate detection statistics
  const detectionStats = useMemo(() => {
    const onlineDevices = devices.filter(d => d.status === 'online').length;
    const offlineDevices = devices.filter(d =>
      d.status === 'offline' || d.status === 'gone_silent' || d.status === 'unsynced'
    ).length;

    // Count detections by device status
    const onlineDetections = alerts.filter(a => {
      const device = devices.find(d => d.id === a.device_id);
      return device?.status === 'online';
    }).length;

    const offlineDetections = alerts.filter(a => {
      const device = devices.find(d => d.id === a.device_id);
      return device?.status === 'offline' || device?.status === 'gone_silent' || device?.status === 'unsynced';
    }).length;

    // Calculate detection rates
    const onlineDetectionRate = onlineDevices > 0 ? (onlineDetections / onlineDevices) * 100 : 0;
    const offlineDetectionRate = offlineDevices > 0 ? (offlineDetections / offlineDevices) * 100 : 0;

    const difference = onlineDetectionRate - offlineDetectionRate;

    // Determine trend
    let trend: "up" | "down" | "stable";
    if (Math.abs(difference) < 5) trend = "stable";
    else if (difference > 0) trend = "up";
    else trend = "down";

    return {
      period: "Last 24 hours",
      onlineDetections,
      offlineDetections,
      onlineDevices,
      offlineDevices,
      onlineDetectionRate: Math.round(onlineDetectionRate),
      offlineDetectionRate: Math.round(offlineDetectionRate),
      difference: Math.round(difference),
      trend,
    };
  }, [alerts, devices]);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-3 w-3 text-green-500" />;
      case "down":
        return <TrendingUp className="h-3 w-3 text-red-500 rotate-180" />;
      default:
        return <Activity className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "up":
        return "text-green-500";
      case "down":
        return "text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden"
    >
      <div className="px-4 lg:px-5 py-3 lg:py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Online vs Offline Detection</h3>
        </div>
      </div>

      <div className="p-4 lg:p-5 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Wifi className="h-4 w-4 text-green-500" />
              <span className="text-xs font-medium text-green-500">Online</span>
            </div>
            <p className="text-lg font-bold text-foreground">{detectionStats.onlineDevices}</p>
            <p className="text-xs text-muted-foreground">
              {detectionStats.onlineDetections} detections
            </p>
            <p className="text-xs text-green-500 font-medium">
              {detectionStats.onlineDetectionRate}% rate
            </p>
          </div>

          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <WifiOff className="h-4 w-4 text-red-500" />
              <span className="text-xs font-medium text-red-500">Offline</span>
            </div>
            <p className="text-lg font-bold text-foreground">{detectionStats.offlineDevices}</p>
            <p className="text-xs text-muted-foreground">
              {detectionStats.offlineDetections} detections
            </p>
            <p className="text-xs text-red-500 font-medium">
              {detectionStats.offlineDetectionRate}% rate
            </p>
          </div>

          <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-primary">Difference</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {Math.abs(detectionStats.difference)}%
            </p>
            <div className="flex items-center gap-1">
              {getTrendIcon(detectionStats.trend)}
              <span className={`text-xs font-medium ${getTrendColor(detectionStats.trend)}`}>
                {detectionStats.trend === "up" ? "Higher online" :
                  detectionStats.trend === "down" ? "Higher offline" : "Equal rates"}
              </span>
            </div>
          </div>

          <div className="p-3 bg-muted/50 border border-border rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Insight</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {detectionStats.trend === "up"
                ? "Better detection when online"
                : detectionStats.trend === "down"
                  ? "Offline devices need attention"
                  : "Consistent detection rates"}
            </p>
          </div>
        </div>

        {/* Time Series Chart */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-3">24-Hour Trend</h4>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                interval={2}
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip content={<TimeSeriesTooltip />} />
              <Area
                type="monotone"
                dataKey="online"
                stackId="1"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="offline"
                stackId="1"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.6}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Detection Rate Comparison */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-3">Detection Rate Comparison</h4>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-green-500">Online Devices</span>
                <span className="text-xs text-muted-foreground">{detectionStats.onlineDetectionRate}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full bg-green-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${detectionStats.onlineDetectionRate}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-red-500">Offline Devices</span>
                <span className="text-xs text-muted-foreground">{detectionStats.offlineDetectionRate}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full bg-red-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${detectionStats.offlineDetectionRate}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
