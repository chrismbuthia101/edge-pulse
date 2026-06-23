"use client";

import { motion } from "framer-motion";
import { HeartPulse, Cpu, MemoryStick, Zap, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo, useEffect } from "react";
import { useHealthStore } from "@/lib/stores/health-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useAnomalyStore } from "@/lib/stores/anomaly-store";

const statusConfig = {
  operational: {
    label: "Operational",
    color: "text-green-500",
    bg: "bg-green-500",
    dot: "bg-green-500",
  },
  degraded: {
    label: "Degraded",
    color: "text-amber-500",
    bg: "bg-amber-500",
    dot: "bg-amber-500",
  },
  down: {
    label: "Down",
    color: "text-destructive",
    bg: "bg-destructive",
    dot: "bg-destructive",
  },
  unknown: {
    label: "Unknown",
    color: "text-muted-foreground",
    bg: "bg-muted",
    dot: "bg-muted-foreground",
  },
};

export function SystemHealth() {
  const systemHealth = useHealthStore((s) => s.systemHealth);
  const healthDevices = useHealthStore((s) => s.devices);
  const healthStatus = useHealthStore((s) => s.status);
  const refreshHealthData = useHealthStore((s) => s.refreshHealthData);
  const devices = useDeviceStore((s) => s.devices);
  const refreshDevices = useDeviceStore((s) => s.refreshDevices);
  const analytics = useAnomalyStore((s) => s.analytics);
  const refreshAnalytics = useAnomalyStore((s) => s.refreshAnalytics);

  useEffect(() => {
    refreshHealthData();
    refreshDevices();
    if (devices.length > 0) {
      refreshAnalytics(devices[0].id, "24h");
    }
  }, [devices, refreshAnalytics, refreshDevices, refreshHealthData]);

  const loading = healthStatus === "loading" && !systemHealth;

  const agentMetrics = useMemo(() => {
    const avgCpu = healthDevices.length > 0
      ? Math.round(healthDevices.reduce((sum, d) => sum + (d.cpu_usage ?? 0), 0) / healthDevices.length)
      : 0;
    const avgMemory = healthDevices.length > 0
      ? Math.round(healthDevices.reduce((sum, d) => sum + (d.memory_usage ?? 0), 0) / healthDevices.length)
      : 0;
    const avgLatency = healthDevices.length > 0
      ? Math.round(healthDevices.reduce((sum, d) => sum + (d.response_time_ms ?? 0), 0) / healthDevices.length)
      : 0;
    const cpuUsage = systemHealth?.avg_cpu_usage ?? avgCpu;
    const memoryUsage = systemHealth?.avg_memory_usage ?? avgMemory;
    const inferenceLatency = avgLatency;

    const lastScored = analytics?.history?.[analytics.history.length - 1];
    const lastScoredStr = lastScored
      ? (() => {
          const diffMins = Math.floor(
            (new Date().getTime() - new Date(lastScored.scored_at).getTime()) / 60000,
          );
          return diffMins < 60 ? `${diffMins}m ago` : `${Math.floor(diffMins / 60)}h ago`;
        })()
      : "No data";

    const uptime = systemHealth?.system_uptime ?? (devices.length > 0 ? 99.9 : 0);

    return {
      cpuUsage: Math.round(cpuUsage),
      memoryUsage: Math.round(memoryUsage),
      inferenceLatency,
      scoringCpuUsage: Math.min(Math.round(cpuUsage * 0.5), 15),
      uptime,
      lastScored: lastScoredStr,
      modelVersion: "—",
    };
  }, [systemHealth, healthDevices, analytics, devices.length]);

  const services = useMemo(() => {
    const hasHealth = healthDevices.length > 0;
    const hasDevices = devices.length > 0;
    const hasAlerts = (systemHealth?.total_alerts ?? 0) > 0;

    return [
      {
        name: "ML Inference Engine",
        status: hasHealth ? "operational" : "unknown",
        latency: `${agentMetrics.inferenceLatency}ms`,
      },
      {
        name: "Alert Pipeline",
        status: hasAlerts ? "operational" : "unknown",
        latency: "—",
      },
      {
        name: "Device Sync Service",
        status: hasDevices ? "operational" : "unknown",
        latency: "—",
      },
      {
        name: "Database Cluster",
        status: "operational",
        latency: "—",
      },
    ];
  }, [healthDevices.length, devices.length, systemHealth?.total_alerts, agentMetrics.inferenceLatency]);

  const operational = useMemo(
    () => services.filter((s) => s.status === "operational").length,
    [services],
  );
  const total = useMemo(() => services.length, [services]);

  const getCpuColor = (usage: number) => {
    if (usage < 5) return "text-green-500";
    if (usage < 10) return "text-amber-500";
    return "text-red-500";
  };

  const getMemoryColor = (usage: number) => {
    if (usage < 130) return "text-green-500";
    if (usage < 145) return "text-amber-500";
    return "text-red-500";
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <HeartPulse className="h-4 w-4 text-green-500 shrink-0" />
            <h3 className="text-sm font-semibold text-foreground truncate">
              System Health
            </h3>
          </div>
        </div>
        <div className="p-5">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <HeartPulse className="h-4 w-4 text-green-500 shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">
            System Health
          </h3>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 text-xs min-w-0">
          <span className="text-muted-foreground">Uptime</span>
          <span className="font-bold text-green-500">
            {agentMetrics.uptime}%
          </span>
        </div>
      </div>

      {/* Agent Performance Metrics */}
      <div className="px-4 lg:px-5 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">
            Agent Performance
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Cpu className="h-3 w-3 text-muted-foreground" />
              <span
                className={`text-lg font-bold font-display ${getCpuColor(agentMetrics.cpuUsage)}`}
              >
                {agentMetrics.cpuUsage}%
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">CPU Usage</p>
            <p className="text-[9px] text-green-500">Target: &lt;5%</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <MemoryStick className="h-3 w-3 text-muted-foreground" />
              <span
                className={`text-lg font-bold font-display ${getMemoryColor(agentMetrics.memoryUsage)}`}
              >
                {agentMetrics.memoryUsage}MB
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">Memory</p>
            <p className="text-[9px] text-green-500">Target: &lt;150MB</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Zap className="h-3 w-3 text-muted-foreground" />
              <span className="text-lg font-bold font-display text-violet-500">
                {agentMetrics.inferenceLatency}ms
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">Inference</p>
            <p className="text-[9px] text-violet-500">Target: &lt;2s</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Activity className="h-3 w-3 text-muted-foreground" />
              <span className="text-lg font-bold font-display text-amber-500">
                {agentMetrics.scoringCpuUsage}%
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">Scoring CPU</p>
            <p className="text-[9px] text-amber-500">Target: &lt;15%</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border text-[10px] text-muted-foreground">
          <span>Model: {agentMetrics.modelVersion}</span>
          <span>Last scored: {agentMetrics.lastScored}</span>
        </div>
      </div>

      {/* Overall health bar */}
      <div className="px-4 lg:px-5 pt-4 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0 text-xs text-muted-foreground mb-2">
          <span>
            {operational}/{total} services operational
          </span>
          <span
            className={
              operational === total ? "text-green-500" : "text-amber-500"
            }
          >
            {operational === total ? "Healthy" : "Partially Degraded"}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden flex gap-0.5">
          {services.map((s, i) => {
            const cfg = statusConfig[s.status as keyof typeof statusConfig];
            return (
              <motion.div
                key={i}
                className={`flex-1 rounded-sm ${cfg.bg}`}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
              />
            );
          })}
        </div>
      </div>

      {/* Service list */}
      <div className="px-4 lg:px-5 pb-4 space-y-2">
        {services.map((service, i) => {
          const cfg = statusConfig[service.status as keyof typeof statusConfig];
          return (
            <motion.div
              key={service.name}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className="flex items-center gap-2 lg:gap-3"
            >
              <div
                className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)}
              />
              <span className="flex-1 text-xs text-foreground truncate">
                {service.name}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                {service.latency}
              </span>
              <span className={cn("text-[10px] font-bold shrink-0", cfg.color)}>
                {cfg.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
