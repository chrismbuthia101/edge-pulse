"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Cpu, MemoryStick, Zap, Activity } from "lucide-react";

interface AgentMetrics {
  cpuUsage: number;
  memoryUsage: number;
  inferenceLatency: number;
  inferencesPerSecond: number;
  uptime: number;
  lastScored: string;
  modelVersion: string;
  featureVectorSize: number;
  anomalyThreshold: number;
}

export function AgentPerformance() {
  const [metrics, setMetrics] = useState<AgentMetrics>({
    cpuUsage: 3.2,
    memoryUsage: 124,
    inferenceLatency: 12,
    inferencesPerSecond: 2.4,
    uptime: 99.94,
    lastScored: "2m ago",
    modelVersion: "v2.4.1",
    featureVectorSize: 47,
    anomalyThreshold: 0.75
  });

  // Simulate real-time updates for demonstration
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => ({
        ...prev,
        cpuUsage: Math.max(1.5, Math.min(8.7, prev.cpuUsage + (Math.random() - 0.5) * 0.8)),
        memoryUsage: Math.max(110, Math.min(145, prev.memoryUsage + (Math.random() - 0.5) * 5)),
        inferenceLatency: Math.max(8, Math.min(25, prev.inferenceLatency + (Math.random() - 0.5) * 2)),
        inferencesPerSecond: Math.max(1.8, Math.min(3.2, prev.inferencesPerSecond + (Math.random() - 0.5) * 0.3)),
        lastScored: "Just now"
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

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

  const getLatencyColor = (latency: number) => {
    if (latency < 15) return "text-green-500";
    if (latency < 20) return "text-amber-500";
    return "text-red-500";
  };

  return (
    <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">Agent Performance</h3>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 text-xs min-w-0">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-muted-foreground">Live Monitoring</span>
        </div>
      </div>

      {/* Performance Metrics Grid */}
      <div className="p-4 lg:p-5 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* CPU Usage */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-3 bg-muted/30 rounded-lg border border-border"
          >
            <div className="flex items-center justify-between mb-2">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <Activity className="h-3 w-3 text-muted-foreground" />
            </div>
            <p className={`text-lg font-bold font-display ${getCpuColor(metrics.cpuUsage)}`}>
              {metrics.cpuUsage.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">CPU Usage</p>
            <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${getCpuColor(metrics.cpuUsage).replace('text-', 'bg-')}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(metrics.cpuUsage * 10, 100)}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <p className="text-[9px] text-green-500 mt-1">Target: &lt;5%</p>
          </motion.div>

          {/* Memory Usage */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-3 bg-muted/30 rounded-lg border border-border"
          >
            <div className="flex items-center justify-between mb-2">
              <MemoryStick className="h-4 w-4 text-muted-foreground" />
              <Activity className="h-3 w-3 text-muted-foreground" />
            </div>
            <p className={`text-lg font-bold font-display ${getMemoryColor(metrics.memoryUsage)}`}>
              {metrics.memoryUsage}MB
            </p>
            <p className="text-xs text-muted-foreground">Memory</p>
            <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${getMemoryColor(metrics.memoryUsage).replace('text-', 'bg-')}`}
                initial={{ width: 0 }}
                animate={{ width: `${(metrics.memoryUsage / 150) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <p className="text-[9px] text-green-500 mt-1">Target: &lt;150MB</p>
          </motion.div>

          {/* Inference Latency */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-3 bg-muted/30 rounded-lg border border-border"
          >
            <div className="flex items-center justify-between mb-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <Activity className="h-3 w-3 text-muted-foreground" />
            </div>
            <p className={`text-lg font-bold font-display ${getLatencyColor(metrics.inferenceLatency)}`}>
              {metrics.inferenceLatency}ms
            </p>
            <p className="text-xs text-muted-foreground">Latency</p>
            <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${getLatencyColor(metrics.inferenceLatency).replace('text-', 'bg-')}`}
                initial={{ width: 0 }}
                animate={{ width: `${(metrics.inferenceLatency / 50) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <p className="text-[9px] text-violet-500 mt-1">Target: &lt;2s</p>
          </motion.div>

          {/* Throughput */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="p-3 bg-muted/30 rounded-lg border border-border"
          >
            <div className="flex items-center justify-between mb-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <Activity className="h-3 w-3 text-green-500 animate-pulse" />
            </div>
            <p className="text-lg font-bold font-display text-green-500">
              {metrics.inferencesPerSecond.toFixed(1)}/s
            </p>
            <p className="text-xs text-muted-foreground">Throughput</p>
            <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-green-500"
                initial={{ width: 0 }}
                animate={{ width: `${(metrics.inferencesPerSecond / 5) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <p className="text-[9px] text-muted-foreground mt-1">Inferences/sec</p>
          </motion.div>
        </div>

        {/* Agent Status Details */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-xs"
        >
          <div className="flex items-center gap-4 text-muted-foreground">
            <span>Model: {metrics.modelVersion}</span>
            <span>Vector: {metrics.featureVectorSize} dims</span>
            <span>Threshold: {metrics.anomalyThreshold}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Last scored:</span>
            <span className="text-green-500 font-medium">{metrics.lastScored}</span>
          </div>
        </motion.div>

        {/* Performance Targets Summary */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[10px]"
        >
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-muted-foreground">CPU &lt;5%: {metrics.cpuUsage < 5 ? "PASS" : "FAIL"}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-muted-foreground">Memory &lt;150MB: {metrics.memoryUsage < 150 ? "PASS" : "FAIL"}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-muted-foreground">Latency &lt;2s: {metrics.inferenceLatency < 2000 ? "PASS" : "FAIL"}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-muted-foreground">Uptime: {metrics.uptime}%</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
