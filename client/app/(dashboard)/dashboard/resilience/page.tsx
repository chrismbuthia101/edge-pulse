"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Activity,
  Server,
  HardDrive,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  Battery,
  Signal,
  Download,
  Upload,
  Zap,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSyncQueueStore } from "@/stores/sync-queue-store";
import { useDeviceStore } from "@/stores/device-store";
import { cn } from "@/lib/utils";

interface ConnectionMetrics {
  device_id: string;
  device_name: string;
  connection_state: "ONLINE" | "DEGRADED" | "OFFLINE" | "RECONNECTING";
  signal_strength: number; // 0-100
  latency_ms: number;
  packet_loss: number; // percentage
  bandwidth_up: number; // Mbps
  bandwidth_down: number; // Mbps
  last_seen: string;
  uptime_percentage: number;
  reconnect_attempts: number;
  queue_depth: number;
}

interface ResilienceMetrics {
  total_devices: number;
  online_devices: number;
  degraded_devices: number;
  offline_devices: number;
  average_uptime: number;
  total_queue_depth: number;
  sync_success_rate: number;
  average_latency: number;
  network_health_score: number;
}

export default function ResiliencePage() {
  const [selectedDevice, setSelectedDevice] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<string>("1h");

  const { summaries, totalPending, totalFailed, initialize: initSync } = useSyncQueueStore();
  const { devices, initialize: initDevices } = useDeviceStore();

  useEffect(() => {
    initSync();
    initDevices();
  }, [initSync, initDevices]);

  // Mock connection metrics data
  const connectionMetrics: ConnectionMetrics[] = useMemo(() => {
    // Create deterministic pseudo-random values based on device properties
    const hash = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return (hash % 1000 + 1000) % 1000 / 1000; // Normalize to 0-1
    };

    return devices.map((device, index) => {
      const seed = hash(device.id + device.name);
      const indexSeed = hash(device.id + index);

      // Deterministic pseudo-random values
      const connectionValue = seed;
      const connection_state = connectionValue > 0.8 ? "OFFLINE" : connectionValue > 0.6 ? "DEGRADED" : "ONLINE";
      const signal_strength = Math.floor(seed * 100);
      const latency_ms = Math.floor(indexSeed * 200) + 10;
      const packet_loss = seed * 5;
      const bandwidth_up = indexSeed * 100;
      const bandwidth_down = seed * 500;
      const last_seen = new Date(Date.parse('2024-01-01T00:00:00Z') + seed * 3600000).toISOString();
      const uptime_percentage = seed * 20 + 80;
      const reconnect_attempts = Math.floor(indexSeed * 5);
      const queue_depth = Math.floor(seed * 100);

      return {
        device_id: device.id,
        device_name: device.name,
        connection_state: connection_state as "ONLINE" | "DEGRADED" | "OFFLINE" | "RECONNECTING",
        signal_strength,
        latency_ms,
        packet_loss,
        bandwidth_up,
        bandwidth_down,
        last_seen,
        uptime_percentage,
        reconnect_attempts,
        queue_depth,
      };
    });
  }, [devices]);

  const resilienceMetrics: ResilienceMetrics = useMemo(() => {
    const online = connectionMetrics.filter(d => d.connection_state === "ONLINE").length;
    const degraded = connectionMetrics.filter(d => d.connection_state === "DEGRADED").length;
    const offline = connectionMetrics.filter(d => d.connection_state === "OFFLINE").length;
    const avgUptime = connectionMetrics.reduce((sum, d) => sum + d.uptime_percentage, 0) / connectionMetrics.length || 0;
    const totalQueue = connectionMetrics.reduce((sum, d) => sum + d.queue_depth, 0);
    const avgLatency = connectionMetrics.reduce((sum, d) => sum + d.latency_ms, 0) / connectionMetrics.length || 0;

    return {
      total_devices: connectionMetrics.length,
      online_devices: online,
      degraded_devices: degraded,
      offline_devices: offline,
      average_uptime: Math.round(avgUptime),
      total_queue_depth: totalQueue + totalPending,
      sync_success_rate: 95.2, // Mock value
      average_latency: Math.round(avgLatency),
      network_health_score: Math.round((online / connectionMetrics.length) * 100),
    };
  }, [connectionMetrics, totalPending]);

  const filteredMetrics = useMemo(() => {
    if (selectedDevice === "all") return connectionMetrics;
    return connectionMetrics.filter(m => m.device_id === selectedDevice);
  }, [connectionMetrics, selectedDevice]);

  const getConnectionColor = (state: string) => {
    switch (state) {
      case "ONLINE": return "text-green-500 bg-green-500/10 border-green-500/20";
      case "DEGRADED": return "text-amber-500 bg-amber-500/10 border-amber-500/20";
      case "OFFLINE": return "text-destructive bg-destructive/10 border-destructive/20";
      case "RECONNECTING": return "text-blue-500 bg-blue-500/10 border-blue-500/20";
      default: return "text-muted-foreground bg-muted border-border";
    }
  };

  const getConnectionIcon = (state: string) => {
    switch (state) {
      case "ONLINE": return <Wifi className="h-4 w-4" />;
      case "DEGRADED": return <Wifi className="h-4 w-4" />;
      case "OFFLINE": return <WifiOff className="h-4 w-4" />;
      case "RECONNECTING": return <RefreshCw className="h-4 w-4 animate-spin" />;
      default: return <WifiOff className="h-4 w-4" />;
    }
  };

  const getSignalColor = (strength: number) => {
    if (strength >= 80) return "text-green-500";
    if (strength >= 60) return "text-amber-500";
    if (strength >= 40) return "text-orange-500";
    return "text-red-500";
  };

  const getLatencyColor = (latency: number) => {
    if (latency < 50) return "text-green-500";
    if (latency < 100) return "text-amber-500";
    if (latency < 200) return "text-orange-500";
    return "text-red-500";
  };

  const formatTimeAgo = (dateString: string): string => {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <div className="max-w-[1400px] space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold text-foreground">
            Network Resilience
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time connection monitoring and offline resilience indicators
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full border",
            resilienceMetrics.network_health_score >= 90
              ? "bg-green-500/10 border-green-500/20"
              : resilienceMetrics.network_health_score >= 70
                ? "bg-amber-500/10 border-amber-500/20"
                : "bg-destructive/10 border-destructive/20"
          )}>
            <Activity className="h-3.5 w-3.5" />
            <span className={cn(
              "text-xs font-medium",
              resilienceMetrics.network_health_score >= 90
                ? "text-green-600"
                : resilienceMetrics.network_health_score >= 70
                  ? "text-amber-600"
                  : "text-destructive"
            )}>
              {resilienceMetrics.network_health_score}% Health
            </span>
          </div>

          <Button variant="outline" size="sm">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Network Health Alert */}
      {resilienceMetrics.offline_devices > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-4 rounded-xl border",
            resilienceMetrics.offline_devices > resilienceMetrics.total_devices * 0.3
              ? "bg-destructive/10 border-destructive/20"
              : "bg-amber-500/10 border-amber-500/20"
          )}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className={cn(
              "h-5 w-5 mt-0.5",
              resilienceMetrics.offline_devices > resilienceMetrics.total_devices * 0.3
                ? "text-destructive"
                : "text-amber-500"
            )} />
            <div className="flex-1">
              <h3 className={cn(
                "font-semibold text-sm",
                resilienceMetrics.offline_devices > resilienceMetrics.total_devices * 0.3
                  ? "text-destructive"
                  : "text-amber-600"
              )}>
                Network Connectivity Issues
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {resilienceMetrics.offline_devices} of {resilienceMetrics.total_devices} devices offline.
                {resilienceMetrics.total_queue_depth > 0 && ` ${resilienceMetrics.total_queue_depth} items queued for sync.`}
              </p>
            </div>
            <Badge variant={resilienceMetrics.offline_devices > resilienceMetrics.total_devices * 0.3 ? "destructive" : "secondary"}>
              {Math.round((resilienceMetrics.offline_devices / resilienceMetrics.total_devices) * 100)}% Offline
            </Badge>
          </div>
        </motion.div>
      )}

      {/* Resilience Metrics Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Wifi className="h-4 w-4 text-green-500" />
                <Badge variant="secondary" className="text-xs">
                  {resilienceMetrics.network_health_score}%
                </Badge>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {resilienceMetrics.online_devices}/{resilienceMetrics.total_devices}
              </p>
              <p className="text-xs text-muted-foreground">Devices Online</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <Badge variant="secondary" className="text-xs">
                  {resilienceMetrics.average_uptime}%
                </Badge>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {resilienceMetrics.average_uptime}%
              </p>
              <p className="text-xs text-muted-foreground">Average Uptime</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <HardDrive className="h-4 w-4 text-amber-500" />
                <Badge variant="secondary" className="text-xs">
                  Queue
                </Badge>
              </div>
              <p className="text-2xl font-bold text-amber-500">
                {resilienceMetrics.total_queue_depth}
              </p>
              <p className="text-xs text-muted-foreground">Items Queued</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Zap className="h-4 w-4 text-violet-500" />
                <Badge variant="secondary" className="text-xs">
                  {resilienceMetrics.average_latency}ms
                </Badge>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {resilienceMetrics.average_latency}ms
              </p>
              <p className="text-xs text-muted-foreground">Avg Latency</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="connections" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <TabsList className="grid w-full sm:w-auto grid-cols-3">
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="queues">Sync Queues</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Select value={selectedDevice} onValueChange={setSelectedDevice}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All Devices" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Devices</SelectItem>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5m">5 min</SelectItem>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="24h">24 hours</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Connections Tab */}
        <TabsContent value="connections" className="space-y-4">
          <div className="grid gap-4">
            {filteredMetrics.map((metrics, index) => (
              <motion.div
                key={metrics.device_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={cn(
                  "border transition-all duration-200 hover:shadow-md",
                  metrics.connection_state === "OFFLINE" && "border-destructive/50 bg-destructive/5",
                  metrics.connection_state === "DEGRADED" && "border-amber-500/50 bg-amber-500/5",
                  metrics.connection_state === "ONLINE" && "border-green-500/50 bg-green-500/5"
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg border",
                          getConnectionColor(metrics.connection_state)
                        )}>
                          {getConnectionIcon(metrics.connection_state)}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">
                            {metrics.device_name}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {metrics.connection_state} · Last seen {formatTimeAgo(metrics.last_seen)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className={cn(
                          "text-xs",
                          getConnectionColor(metrics.connection_state)
                        )}>
                          {metrics.connection_state}
                        </Badge>

                        {metrics.queue_depth > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {metrics.queue_depth} queued
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Signal Strength</p>
                        <div className="flex items-center gap-2">
                          <Signal className={cn("h-3 w-3", getSignalColor(metrics.signal_strength))} />
                          <span className={cn("text-sm font-medium", getSignalColor(metrics.signal_strength))}>
                            {metrics.signal_strength}%
                          </span>
                        </div>
                        <Progress value={metrics.signal_strength} className="h-1 mt-1" />
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Latency</p>
                        <div className="flex items-center gap-2">
                          <Clock className={cn("h-3 w-3", getLatencyColor(metrics.latency_ms))} />
                          <span className={cn("text-sm font-medium", getLatencyColor(metrics.latency_ms))}>
                            {metrics.latency_ms}ms
                          </span>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Packet Loss</p>
                        <div className="flex items-center gap-2">
                          <TrendingDown className={cn("h-3 w-3", metrics.packet_loss > 2 ? "text-red-500" : "text-green-500")} />
                          <span className={cn("text-sm font-medium", metrics.packet_loss > 2 ? "text-red-500" : "text-green-500")}>
                            {metrics.packet_loss.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Bandwidth</p>
                        <div className="flex items-center gap-2">
                          <Download className="h-3 w-3 text-blue-500" />
                          <span className="text-sm font-medium text-blue-500">
                            {Math.round(metrics.bandwidth_down)}Mbps
                          </span>
                          <Upload className="h-3 w-3 text-green-500" />
                          <span className="text-sm font-medium text-green-500">
                            {Math.round(metrics.bandwidth_up)}Mbps
                          </span>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Uptime</p>
                        <div className="flex items-center gap-2">
                          <Battery className={cn("h-3 w-3", metrics.uptime_percentage > 95 ? "text-green-500" : "text-amber-500")} />
                          <span className={cn("text-sm font-medium", metrics.uptime_percentage > 95 ? "text-green-500" : "text-amber-500")}>
                            {metrics.uptime_percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {metrics.connection_state === "OFFLINE" && (
                      <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <p className="text-xs text-destructive font-medium">
                          Device Offline
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Device has been offline for {formatTimeAgo(metrics.last_seen)}.
                          {metrics.reconnect_attempts > 0 && ` ${metrics.reconnect_attempts} reconnection attempts made.`}
                          {metrics.queue_depth > 0 && ` ${metrics.queue_depth} operations queued.`}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* Sync Queues Tab */}
        <TabsContent value="queues" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-amber-500" />
                  Queue Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-amber-500/8 border border-amber-500/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <WifiOff className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-sm font-bold text-amber-500">{totalPending + totalFailed}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Total Queued</p>
                  </div>
                  <div className="p-3 bg-destructive/8 border border-destructive/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-sm font-bold text-destructive">{totalFailed}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Failed Syncs</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sync Success Rate</span>
                    <span className="font-medium">{resilienceMetrics.sync_success_rate}%</span>
                  </div>
                  <Progress value={resilienceMetrics.sync_success_rate} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Server className="h-5 w-5 text-primary" />
                  Device Queues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {summaries.slice(0, 5).map((summary) => (
                    <div key={summary.device_id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Wifi className={cn("h-3 w-3", summary.pending_count > 0 ? "text-amber-500" : "text-green-500")} />
                        <span className="text-sm font-medium">{summary.device_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {summary.pending_count > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {summary.pending_count}
                          </Badge>
                        )}
                        {summary.failed_count > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {summary.failed_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-green-500" />
                  Network Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Average Latency</p>
                    <p className="text-xl font-bold text-foreground">{resilienceMetrics.average_latency}ms</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Health Score</p>
                    <p className="text-xl font-bold text-green-500">{resilienceMetrics.network_health_score}%</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Network Health</span>
                    <span className="font-medium">{resilienceMetrics.network_health_score}%</span>
                  </div>
                  <Progress value={resilienceMetrics.network_health_score} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-violet-500" />
                  Resilience Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">System Uptime</p>
                    <p className="text-xl font-bold text-foreground">{resilienceMetrics.average_uptime}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Queue Depth</p>
                    <p className="text-xl font-bold text-amber-500">{resilienceMetrics.total_queue_depth}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Average Uptime</span>
                    <span className="font-medium">{resilienceMetrics.average_uptime}%</span>
                  </div>
                  <Progress value={resilienceMetrics.average_uptime} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
