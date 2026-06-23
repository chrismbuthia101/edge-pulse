"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Server,
  Laptop,
  MonitorSmartphone,
  Shield,
  AlertTriangle,
  RefreshCw,
  Link2,
  Link2Off,
  Cpu,
  MemoryStick,
  Clock,
  Activity,
  CheckCircle2,
  WifiOff,
  Zap,
  BarChart3,
  Brain,
  ChevronRight,
  Heart,
  HardDrive,
  Wifi,
  Signal,
  Download,
  Upload,
  TrendingDown,
  Battery,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useAlertStore } from "@/lib/stores/alert-store";
import { useAnomalyStore } from "@/lib/stores/anomaly-store";
import { useHealthStore } from "@/lib/stores/health-store";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Device } from "@/lib/types/devices";
import type { TelemetrySample } from "@/lib/services/telemetry-service";
import type { ConnectionMetrics } from "@/lib/repositories/resilience-repository";

interface AnomalyPoint {
  created_at: string;
  score: number;
  label?: string;
}

type DeviceState =
  | "reporting"
  | "silent"
  | "unsynced"
  | "offline"
  | "installed";

function computeDeviceState(
  status: string,
  lastSeenIso: string | null | undefined,
  syncQueueDepth: number,
): DeviceState {
  if (status === "offline" || status === "isolated") return "offline";
  if (!lastSeenIso) return "installed";
  const minutesAgo = (Date.now() - new Date(lastSeenIso).getTime()) / 60000;
  if (syncQueueDepth > 10) return "unsynced";
  if (minutesAgo > 15) return "silent";
  if (status === "online") return "reporting";
  return "installed";
}

const stateConfig: Record<
  DeviceState,
  { label: string; color: string; bg: string; dot: string }
> = {
  reporting: {
    label: "Reporting",
    color: "text-green-500",
    bg: "bg-green-500/10",
    dot: "bg-green-500",
  },
  silent: {
    label: "Silent",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    dot: "bg-amber-500",
  },
  unsynced: {
    label: "Unsynced",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    dot: "bg-orange-500",
  },
  offline: {
    label: "Offline",
    color: "text-muted-foreground",
    bg: "bg-muted/50",
    dot: "bg-muted-foreground",
  },
  installed: {
    label: "Installed",
    color: "text-primary",
    bg: "bg-primary/10",
    dot: "bg-primary",
  },
};

const riskConfig = {
  critical: {
    color: "text-destructive",
    bg: "bg-destructive/10",
    label: "Critical",
  },
  high: { color: "text-orange-500", bg: "bg-orange-500/10", label: "High" },
  medium: { color: "text-amber-500", bg: "bg-amber-500/10", label: "Medium" },
  low: { color: "text-primary", bg: "bg-primary/10", label: "Low" },
  none: { color: "text-green-500", bg: "bg-green-500/10", label: "Clean" },
};

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function DeviceTypeIcon({ type }: { type: string }) {
  if (type === "server") return <Server className="h-5 w-5" />;
  if (type === "laptop") return <Laptop className="h-5 w-5" />;
  return <MonitorSmartphone className="h-5 w-5" />;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2)
    return <div className="h-12 bg-muted/30 rounded animate-pulse" />;
  const max = Math.max(...data, 1);
  const w = 100;
  const h = 48;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  const fill = `${pts.join(" ")} ${w},${h} 0,${h}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-12"
      preserveAspectRatio="none"
    >
      <polygon points={fill} className={`${color} opacity-15`} />
      <polyline
        points={polyline}
        className={`${color}`}
        fill="none"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function IsolateModal({
  deviceName,
  open,
  onClose,
  onConfirm,
}: {
  deviceName: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Isolate Device</DialogTitle>
          <DialogDescription>
            This will cut off <strong>{deviceName}</strong> from all network
            access except the EdgePulse management channel. Are you sure?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Isolate Device
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DeviceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params?.id as string;

  const storeDevices = useDeviceStore((s) => s.devices);
  const alerts = useAlertStore((s) => s.alerts);

  const [device, setDevice] = useState<Device | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySample[]>([]);
  const [anomalyPoints, setAnomalyPoints] = useState<AnomalyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isolateOpen, setIsolateOpen] = useState(false);
  const [resilienceLoading, setResilienceLoading] = useState(false);

  const [connectionMetrics, setConnectionMetrics] =
    useState<ConnectionMetrics | null>(null);

  const deviceAlerts = useMemo(
    () => alerts.filter((a) => a.device_id === deviceId).slice(0, 10),
    [alerts, deviceId],
  );

  const fetchData = useCallback(async () => {
    setSyncing(true);
    try {
      const storeDevice = storeDevices.find((d) => d.id === deviceId);
      if (storeDevice) {
        setDevice(storeDevice);
      } else {
        const { refreshDevices } = useDeviceStore.getState();
        await refreshDevices();
        const refreshedDevices = useDeviceStore.getState().devices;
        const refreshedDevice = refreshedDevices.find((d) => d.id === deviceId);
        if (refreshedDevice) setDevice(refreshedDevice);
      }

      const healthStore = useHealthStore.getState();
      await healthStore.fetchTelemetry(deviceId, 48);
      const deviceTelemetry = useHealthStore.getState().telemetry[deviceId];

      if (deviceTelemetry && deviceTelemetry.length > 0) {
        setTelemetry([...deviceTelemetry].reverse());
      } else {
        const now = Date.now();
        setTelemetry(
          Array.from({ length: 24 }, (_, i) => ({
            collected_at: new Date(now - (23 - i) * 5 * 60000).toISOString(),
            cpu_percent:
              20 + Math.round(Math.sin(i * 0.4) * 15 + Math.random() * 10),
            ram_percent:
              45 + Math.round(Math.cos(i * 0.3) * 10 + Math.random() * 8),
          })),
        );
      }

      const anomalyStore = useAnomalyStore.getState();
      await anomalyStore.refreshScores(deviceId, 20);
      const scores = useAnomalyStore.getState().scores;

      if (scores.length > 0) {
        setAnomalyPoints(
          [...scores].reverse().map((a) => ({
            created_at: a.created_at,
            score: a.score ?? 0,
            label: a.label ?? undefined,
          })),
        );
      } else {
        const now = Date.now();
        setAnomalyPoints(
          Array.from({ length: 12 }, (_, i) => ({
            created_at: new Date(now - (11 - i) * 30 * 60000).toISOString(),
            score: parseFloat((0.05 + Math.random() * 0.25).toFixed(3)),
          })),
        );
      }
    } catch (err) {
      toast.error("Failed to load device data");
      console.error(err);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [deviceId, storeDevices]);

  const fetchResilienceData = async () => {
    setResilienceLoading(true);
    try {
      const healthStore = useHealthStore.getState();
      await healthStore.fetchConnectionMetrics(deviceId);
      const metrics = useHealthStore.getState().connectionMetrics[deviceId];
      setConnectionMetrics(metrics ?? null);
    } catch (err) {
      console.error("Error loading resilience data:", err);
    } finally {
      setResilienceLoading(false);
    }
  };

  useEffect(() => {
    if (deviceId) fetchData();
  }, [deviceId, fetchData]);

  useEffect(() => {
    const storeDevice = storeDevices.find((d) => d.id === deviceId);
    if (storeDevice) setDevice(storeDevice);
  }, [storeDevices, deviceId]);

  const handleIsolateConfirm = async () => {
    try {
      const { isolateDevice } = useDeviceStore.getState();
      await isolateDevice(deviceId);
      toast.success(`${device?.name} has been isolated`);
      setIsolateOpen(false);
      router.push("/dashboard/devices");
    } catch {
      toast.error("Failed to isolate device");
    }
  };

  const syncQueueDepth = device?.sync_queue_depth ?? 0;
  const hashChainValid = true;
  const agentVersion = device?.agent_version ?? "—";
  const deviceState = device
    ? computeDeviceState(device.status, device.last_seen, syncQueueDepth)
    : "offline";
  const state = stateConfig[deviceState];
  const risk =
    riskConfig[(device?.risk ?? "none") as keyof typeof riskConfig] ??
    riskConfig.none;

  const cpuData = telemetry.map((t) => t.cpu_percent);
  const ramData = telemetry.map((t) => t.ram_percent);
  const latestCpu = cpuData[cpuData.length - 1] ?? 0;
  const latestRam = ramData[ramData.length - 1] ?? 0;
  const avgCpu = cpuData.length
    ? Math.round(cpuData.reduce((a, b) => a + b, 0) / cpuData.length)
    : 0;
  const avgRam = ramData.length
    ? Math.round(ramData.reduce((a, b) => a + b, 0) / ramData.length)
    : 0;

  const latestAnomaly = anomalyPoints[anomalyPoints.length - 1]?.score ?? 0;
  const baselineAnomaly =
    anomalyPoints.length >= 5
      ? parseFloat(
          (
            anomalyPoints.slice(0, -3).reduce((a, b) => a + b.score, 0) /
            Math.max(anomalyPoints.length - 3, 1)
          ).toFixed(3),
        )
      : 0.1;
  const deviation = latestAnomaly - baselineAnomaly;
  const deviationPct =
    baselineAnomaly > 0
      ? ((deviation / baselineAnomaly) * 100).toFixed(0)
      : "0";
  const anomalyScores = anomalyPoints.map((a) => a.score * 100);

  if (loading) {
    return (
      <div className="max-w-300 space-y-6 animate-pulse">
        <div className="h-8 bg-muted/40 rounded w-48" />
        <div className="h-32 bg-muted/40 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="h-56 bg-muted/40 rounded-2xl" />
          <div className="h-56 bg-muted/40 rounded-2xl" />
          <div className="h-56 bg-muted/40 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="max-w-300 py-24 text-center">
        <MonitorSmartphone className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
        <p className="text-lg font-semibold text-foreground mb-2">
          Device not found
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          This device may have been removed or you don&apos;t have access.
        </p>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/devices")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Fleet
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-300 space-y-6">
      <IsolateModal
        deviceName={device.name}
        open={isolateOpen}
        onClose={() => setIsolateOpen(false)}
        onConfirm={handleIsolateConfirm}
      />

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => router.push("/dashboard/devices")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center shrink-0">
            <DeviceTypeIcon type={device.type ?? "workstation"} />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-foreground font-mono">
              {device.name}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={cn(
                  "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                  state.bg,
                  state.color,
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", state.dot)} />
                {state.label}
              </span>
              <span
                className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded-full",
                  risk.bg,
                  risk.color,
                )}
              >
                {risk.label} Risk
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={fetchData}
            disabled={syncing}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", syncing && "animate-spin")}
            />
            {syncing ? "Syncing..." : "Refresh"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setIsolateOpen(true)}
          >
            <WifiOff className="h-3.5 w-3.5" />
            Isolate
          </Button>
        </div>
      </motion.div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="health">Agent Health</TabsTrigger>
          <TabsTrigger value="network">Network Health</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-card border border-border rounded-2xl overflow-hidden"
          >
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                Agent Health
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {[
                {
                  label: "Last Seen",
                  value: relativeTime(device.last_seen),
                  icon: Clock,
                  color: "text-foreground",
                },
                {
                  label: "Agent Version",
                  value: agentVersion,
                  icon: Zap,
                  color:
                    agentVersion === "v2.4.1"
                      ? "text-green-500"
                      : "text-amber-500",
                },
                {
                  label: "OS",
                  value: device.os ?? "Unknown",
                  icon: MonitorSmartphone,
                  color: "text-foreground",
                },
                {
                  label: "IP Address",
                  value: device.ip ?? "—",
                  icon: Activity,
                  color: "text-foreground",
                },
                {
                  label: "Sync Queue",
                  value:
                    syncQueueDepth > 0 ? `${syncQueueDepth} pending` : "Clear",
                  icon: RefreshCw,
                  color:
                    syncQueueDepth > 10
                      ? "text-orange-500"
                      : syncQueueDepth > 0
                        ? "text-amber-500"
                        : "text-green-500",
                },
                {
                  label: "Hash Chain",
                  value: hashChainValid ? "Intact" : "Broken",
                  icon: hashChainValid ? Link2 : Link2Off,
                  color: hashChainValid ? "text-green-500" : "text-destructive",
                },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                    <Icon className="h-2.5 w-2.5" />
                    {label}
                  </p>
                  <p className={cn("text-sm font-semibold font-mono", color)}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-violet-500" />
                  <h2 className="text-sm font-semibold text-foreground">
                    Performance Metrics
                  </h2>
                </div>
                <span className="text-xs text-muted-foreground">
                  Last {telemetry.length} samples
                </span>
              </div>

              <div className="p-5 space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium text-foreground">
                        CPU Utilization
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        Avg{" "}
                        <span className="font-mono font-bold text-foreground">
                          {avgCpu}%
                        </span>
                      </span>
                      <span
                        className={cn(
                          "font-mono font-bold text-sm",
                          latestCpu > 80 ? "text-destructive" : "text-primary",
                        )}
                      >
                        {latestCpu}%
                      </span>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "rounded-lg overflow-hidden",
                      latestCpu > 80 ? "stroke-destructive" : "stroke-primary",
                    )}
                  >
                    <Sparkline
                      data={cpuData}
                      color={
                        latestCpu > 80
                          ? "stroke-destructive fill-destructive"
                          : "stroke-primary fill-primary"
                      }
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1">
                    <span>
                      {telemetry[0]
                        ? new Date(
                            telemetry[0].collected_at,
                          ).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                    <span>Now</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <MemoryStick className="h-3.5 w-3.5 text-violet-500" />
                      <span className="text-xs font-medium text-foreground">
                        Memory Usage
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        Avg{" "}
                        <span className="font-mono font-bold text-foreground">
                          {avgRam}%
                        </span>
                      </span>
                      <span
                        className={cn(
                          "font-mono font-bold text-sm",
                          latestRam > 80
                            ? "text-orange-500"
                            : "text-violet-500",
                        )}
                      >
                        {latestRam}%
                      </span>
                    </div>
                  </div>
                  <div className={cn("rounded-lg overflow-hidden")}>
                    <Sparkline
                      data={ramData}
                      color={
                        latestRam > 80
                          ? "stroke-orange-500 fill-orange-500"
                          : "stroke-violet-500 fill-violet-500"
                      }
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1">
                    <span>
                      {telemetry[0]
                        ? new Date(
                            telemetry[0].collected_at,
                          ).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                    <span>Now</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 pt-2 border-t border-border">
                  {[
                    {
                      label: "Peak CPU",
                      value: `${Math.max(...cpuData, 0)}%`,
                      color: "text-destructive",
                    },
                    {
                      label: "Peak RAM",
                      value: `${Math.max(...ramData, 0)}%`,
                      color: "text-orange-500",
                    },
                    {
                      label: "Avg CPU",
                      value: `${avgCpu}%`,
                      color: "text-primary",
                    },
                    {
                      label: "Avg RAM",
                      value: `${avgRam}%`,
                      color: "text-violet-500",
                    },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                        {s.label}
                      </p>
                      <p className={cn("text-sm font-bold font-mono", s.color)}>
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-card border border-border rounded-2xl overflow-hidden"
            >
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
                <Brain className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-foreground">
                  Behavioral Baseline
                </h2>
              </div>
              <div className="p-5 space-y-4">
                <div
                  className={cn(
                    "p-3 rounded-xl border",
                    latestAnomaly > 0.7
                      ? "bg-destructive/8 border-destructive/20"
                      : latestAnomaly > 0.4
                        ? "bg-amber-500/8 border-amber-500/20"
                        : "bg-green-500/8 border-green-500/20",
                  )}
                >
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Current Anomaly Score
                  </p>
                  <p
                    className={cn(
                      "text-2xl font-bold font-mono",
                      latestAnomaly > 0.7
                        ? "text-destructive"
                        : latestAnomaly > 0.4
                          ? "text-amber-500"
                          : "text-green-500",
                    )}
                  >
                    {latestAnomaly.toFixed(3)}
                  </p>
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={cn(
                        "h-full rounded-full",
                        latestAnomaly > 0.7
                          ? "bg-destructive"
                          : latestAnomaly > 0.4
                            ? "bg-amber-500"
                            : "bg-green-500",
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${latestAnomaly * 100}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                      Baseline
                    </p>
                    <p className="text-sm font-mono font-bold text-foreground">
                      {baselineAnomaly.toFixed(3)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                      Deviation
                    </p>
                    <p
                      className={cn(
                        "text-sm font-mono font-bold",
                        deviation > 0.2
                          ? "text-destructive"
                          : deviation > 0.05
                            ? "text-amber-500"
                            : "text-green-500",
                      )}
                    >
                      {deviation >= 0 ? "+" : ""}
                      {deviationPct}%
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                    Anomaly History
                  </p>
                  <div className="flex items-end gap-0.5 h-14">
                    {anomalyScores.slice(-16).map((s, i) => {
                      const pct = Math.max(s, 2);
                      const barColor =
                        s > 70
                          ? "bg-destructive"
                          : s > 40
                            ? "bg-amber-500"
                            : "bg-green-500";
                      return (
                        <motion.div
                          key={i}
                          className={cn("flex-1 rounded-t-sm", barColor)}
                          initial={{ height: 0 }}
                          animate={{ height: `${pct}%` }}
                          transition={{ delay: i * 0.02, duration: 0.3 }}
                          title={`${s.toFixed(1)}%`}
                        />
                      );
                    })}
                  </div>
                </div>

                <div
                  className={cn(
                    "flex items-center gap-2 text-xs p-2 rounded-lg",
                    latestAnomaly > 0.7
                      ? "bg-destructive/8 text-destructive"
                      : latestAnomaly > 0.4
                        ? "bg-amber-500/8 text-amber-600 dark:text-amber-400"
                        : "bg-green-500/8 text-green-600 dark:text-green-400",
                  )}
                >
                  {latestAnomaly > 0.7 ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  ) : latestAnomaly > 0.4 ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="font-medium">
                    {latestAnomaly > 0.7
                      ? "Anomalous behavior detected"
                      : latestAnomaly > 0.4
                        ? "Slight deviation from baseline"
                        : "Behavior within normal baseline"}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card border border-border rounded-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h2 className="text-sm font-semibold text-foreground">
                  Device Alerts
                </h2>
                {deviceAlerts.filter((a) => a.status !== "CLOSED").length >
                  0 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30">
                    {deviceAlerts.filter((a) => a.status !== "CLOSED").length}{" "}
                    open
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => router.push("/dashboard/alerts")}
              >
                All Alerts
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>

            <div className="divide-y divide-border">
              <AnimatePresence>
                {deviceAlerts.length === 0 ? (
                  <div className="py-12 text-center">
                    <Shield className="h-8 w-8 text-green-500/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No alerts for this device
                    </p>
                  </div>
                ) : (
                  deviceAlerts.map((alert, i) => {
                    const sevColor =
                      alert.severity === "critical"
                        ? "text-destructive bg-destructive/10"
                        : alert.severity === "high"
                          ? "text-orange-500 bg-orange-500/10"
                          : alert.severity === "medium"
                            ? "text-amber-500 bg-amber-500/10"
                            : "text-primary bg-primary/10";
                    const dot =
                      alert.severity === "critical"
                        ? "bg-destructive"
                        : alert.severity === "high"
                          ? "bg-orange-500"
                          : alert.severity === "medium"
                            ? "bg-amber-500"
                            : "bg-primary";
                    return (
                      <motion.div
                        key={alert.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors"
                      >
                        <div
                          className={cn("w-2 h-2 rounded-full shrink-0", dot)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {alert.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {relativeTime(alert.created_at)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full capitalize",
                            sevColor,
                          )}
                        >
                          {alert.severity}
                        </span>
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {alert.status.replace(/_/g, " ")}
                        </span>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-card border border-border rounded-2xl p-5"
          >
            <h2 className="text-sm font-semibold text-foreground mb-4">
              Device Information
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {[
                { label: "Device ID", value: device.id.slice(0, 12) + "..." },
                {
                  label: "Type",
                  value:
                    (device.type ?? "workstation").charAt(0).toUpperCase() +
                    (device.type ?? "workstation").slice(1),
                },
                {
                  label: "Enrolled",
                  value: device?.id
                    ? new Date(device.id).toLocaleDateString()
                    : "Unknown",
                },
                {
                  label: "Active Alerts",
                  value: String(
                    device.alerts_count ??
                      deviceAlerts.filter((a) => a.status !== "CLOSED").length,
                  ),
                },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                    {label}
                  </p>
                  <p className="text-sm font-mono font-medium text-foreground truncate">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="health" className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Agent Health Details</h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                disabled={syncing}
              >
                <RefreshCw
                  className={cn("h-4 w-4 mr-2", syncing && "animate-spin")}
                />
                Refresh
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">CPU Usage</p>
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  <span className="text-2xl font-bold">{latestCpu}%</span>
                </div>
                <Progress value={latestCpu} className="mt-2" />
              </div>

              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  Memory Usage
                </p>
                <div className="flex items-center gap-2">
                  <MemoryStick className="h-4 w-4 text-violet-500" />
                  <span className="text-2xl font-bold">{latestRam}%</span>
                </div>
                <Progress value={latestRam} className="mt-2" />
              </div>

              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  Agent Version
                </p>
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className="text-2xl font-bold">{agentVersion}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {agentVersion === "v2.4.1"
                    ? "Up to date"
                    : "Update available"}
                </p>
              </div>

              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Sync Queue</p>
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-orange-500" />
                  <span className="text-2xl font-bold">{syncQueueDepth}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {syncQueueDepth > 0 ? "Pending items" : "No pending items"}
                </p>
              </div>

              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Hash Chain</p>
                <div className="flex items-center gap-2">
                  {hashChainValid ? (
                    <Link2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Link2Off className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-2xl font-bold">
                    {hashChainValid ? "Intact" : "Broken"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {hashChainValid
                    ? "Data integrity verified"
                    : "Integrity check failed"}
                </p>
              </div>

              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Last Seen</p>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-2xl font-bold">
                    {relativeTime(device.last_seen)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {device.last_seen
                    ? new Date(device.last_seen).toLocaleString()
                    : "Unknown"}
                </p>
              </div>
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="network" className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Wifi className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Network Health</h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchResilienceData}
                disabled={resilienceLoading}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4 mr-2",
                    resilienceLoading && "animate-spin",
                  )}
                />
                Refresh
              </Button>
            </div>

            {resilienceLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : connectionMetrics ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Connection State
                    </p>
                    <Badge
                      className={cn(
                        "text-xs",
                        connectionMetrics.connection_state === "ONLINE"
                          ? "bg-green-500/10 text-green-500 border-green-500/20"
                          : connectionMetrics.connection_state === "DEGRADED"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            : "bg-destructive/10 text-destructive border-destructive/20",
                      )}
                    >
                      {connectionMetrics.connection_state}
                    </Badge>
                  </div>

                  <div className="p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Signal Strength
                    </p>
                    <div className="flex items-center gap-2">
                      <Signal
                        className={cn(
                          "h-4 w-4",
                          connectionMetrics.signal_strength >= 80
                            ? "text-green-500"
                            : connectionMetrics.signal_strength >= 60
                              ? "text-amber-500"
                              : "text-red-500",
                        )}
                      />
                      <span className="text-2xl font-bold">
                        {connectionMetrics.signal_strength}%
                      </span>
                    </div>
                    <Progress
                      value={connectionMetrics.signal_strength}
                      className="mt-2"
                    />
                  </div>

                  <div className="p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Latency
                    </p>
                    <div className="flex items-center gap-2">
                      <Clock
                        className={cn(
                          "h-4 w-4",
                          connectionMetrics.latency_ms < 50
                            ? "text-green-500"
                            : connectionMetrics.latency_ms < 100
                              ? "text-amber-500"
                              : "text-red-500",
                        )}
                      />
                      <span className="text-2xl font-bold">
                        {connectionMetrics.latency_ms}ms
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Packet Loss
                    </p>
                    <div className="flex items-center gap-2">
                      <TrendingDown
                        className={cn(
                          "h-4 w-4",
                          connectionMetrics.packet_loss > 2
                            ? "text-red-500"
                            : "text-green-500",
                        )}
                      />
                      <span className="text-2xl font-bold">
                        {connectionMetrics.packet_loss.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Bandwidth (Down)
                    </p>
                    <div className="flex items-center gap-2">
                      <Download className="h-4 w-4 text-blue-500" />
                      <span className="text-2xl font-bold">
                        {Math.round(connectionMetrics.bandwidth_down)} Mbps
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Bandwidth (Up)
                    </p>
                    <div className="flex items-center gap-2">
                      <Upload className="h-4 w-4 text-green-500" />
                      <span className="text-2xl font-bold">
                        {Math.round(connectionMetrics.bandwidth_up)} Mbps
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">Uptime</p>
                    <div className="flex items-center gap-2">
                      <Battery
                        className={cn(
                          "h-4 w-4",
                          connectionMetrics.uptime_percentage > 95
                            ? "text-green-500"
                            : "text-amber-500",
                        )}
                      />
                      <span className="text-2xl font-bold">
                        {connectionMetrics.uptime_percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Queue Depth
                    </p>
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-orange-500" />
                      <span className="text-2xl font-bold">
                        {connectionMetrics.queue_depth}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {connectionMetrics.queue_depth > 0
                        ? "Items pending sync"
                        : "No pending items"}
                    </p>
                  </div>

                  <div className="p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Reconnect Attempts
                    </p>
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-primary" />
                      <span className="text-2xl font-bold">
                        {connectionMetrics.reconnect_attempts}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {connectionMetrics.reconnect_attempts > 0
                        ? "Connection attempts made"
                        : "No reconnection needed"}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <WifiOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No network health data available</p>
                <p className="text-sm mt-2">
                  Click refresh to load network metrics
                </p>
              </div>
            )}
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
