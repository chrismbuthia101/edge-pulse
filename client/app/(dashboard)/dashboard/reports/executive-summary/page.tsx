"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Brain,
  MonitorSmartphone,
  Lock,
  ShieldAlert,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
} from "recharts";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/useAuth";
import { useAlertStore } from "@/lib/stores/alert-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type DateRange = "7d" | "30d" | "90d";

function StatCard({
  title,
  value,
  delta,
  positive,
  icon: Icon,
  color,
  bg,
}: {
  title: string;
  value: string;
  delta: string;
  positive: boolean;
  icon: React.ElementType;
  color: string;
  bg: string;
}) {
  return (
    <div className={cn("rounded-2xl border p-5 relative overflow-hidden", bg)}>
      <div
        className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-30"
        style={{ background: "currentColor" }}
      />
      <div className="flex items-start justify-between mb-3 relative">
        <div
          className={cn(
            "w-9 h-9 rounded-xl border flex items-center justify-center",
            bg,
            `border-${color.split("-")[1]}-500/30`,
          )}
        >
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        <span
          className={cn(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
            positive
              ? "bg-green-500/10 text-green-500"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {positive ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {delta}
        </span>
      </div>
      <p className={cn("text-3xl font-bold font-display relative", color)}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-1 relative">{title}</p>
    </div>
  );
}

export default function ExecutiveSummaryReport() {
  useEffect(() => {
    document.title = "Executive Summary - EdgePulse";
  }, []);
  const router = useRouter();
  const { hasRole } = useAuth();
  const { alerts, initialize: initAlerts } = useAlertStore();
  const { devices, initialize: initDevices } = useDeviceStore();
  const initialized = useRef(false);
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    initAlerts();
    initDevices();
  }, [initAlerts, initDevices]);

  const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }, [days]);

  const periodAlerts = useMemo(
    () => alerts.filter((a) => new Date(a.created_at) >= cutoff),
    [alerts, cutoff],
  );
  const prevCutoff = useMemo(() => {
    const d = new Date(cutoff);
    d.setDate(d.getDate() - days);
    return d;
  }, [cutoff, days]);
  const prevAlerts = useMemo(
    () =>
      alerts.filter((a) => {
        const t = new Date(a.created_at);
        return t >= prevCutoff && t < cutoff;
      }),
    [alerts, prevCutoff, cutoff],
  );

  const metrics = useMemo(() => {
    const total = periodAlerts.length;
    const prevTotal = prevAlerts.length;
    const critical = periodAlerts.filter(
      (a) => a.severity === "critical",
    ).length;
    const resolved = periodAlerts.filter((a) => a.status === "CLOSED").length;
    const resRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
    const avgLatency =
      total > 0
        ? Math.round(
            periodAlerts.reduce((s, a) => s + a.inference_latency_ms, 0) /
              total,
          )
        : 0;
    const onlineDevices = devices.filter((d) => d.status === "online").length;
    const atRisk = devices.filter(
      (d) => d.risk === "critical" || d.risk === "high",
    ).length;
    return {
      total,
      prevTotal,
      critical,
      resolved,
      resRate,
      avgLatency,
      onlineDevices,
      atRisk,
    };
  }, [periodAlerts, prevAlerts, devices]);

  const pct = (curr: number, prev: number) =>
    prev === 0
      ? "new"
      : `${Math.abs(Math.round(((curr - prev) / prev) * 100))}%`;
  const trend = (curr: number, prev: number, lowerIsBetter = true) =>
    lowerIsBetter ? curr <= prev : curr >= prev;

  const weeklyTrend = useMemo(() => {
    const result = [];
    for (let i = Math.min(days - 1, 13); i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const count = alerts.filter((a) => {
        const ad = new Date(a.created_at);
        return ad.toDateString() === d.toDateString();
      }).length;
      const resolved = alerts.filter((a) => {
        const cd = a.closed_at ? new Date(a.closed_at) : null;
        return cd && cd.toDateString() === d.toDateString();
      }).length;
      result.push({ date: label, detected: count, resolved });
    }
    return result;
  }, [alerts, days]);

  const sevDist = useMemo(() => {
    const c: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    periodAlerts.forEach((a) => {
      if (c[a.severity] !== undefined) c[a.severity]++;
    });
    const colors: Record<string, string> = {
      critical: "#ef4444",
      high: "#f97316",
      medium: "#f59e0b",
      low: "#06b6d4",
    };
    return Object.entries(c)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: colors[name] }));
  }, [periodAlerts]);

  const threatsBySource = useMemo(() => {
    const c: Record<string, number> = {};
    periodAlerts.forEach((a) => {
      const s = a.telemetry_source || "UNKNOWN";
      c[s] = (c[s] || 0) + 1;
    });
    return Object.entries(c)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [periodAlerts]);

  const resolutionGauge = [
    {
      name: "Rate",
      value: metrics.resRate,
      fill:
        metrics.resRate >= 80
          ? "#22c55e"
          : metrics.resRate >= 50
            ? "#f59e0b"
            : "#ef4444",
    },
  ];

  const topThreats = useMemo(() => {
    const counts: Record<string, { count: number; critical: number }> = {};
    periodAlerts.forEach((a) => {
      const cat = a.category || "Uncategorized";
      if (!counts[cat]) counts[cat] = { count: 0, critical: 0 };
      counts[cat].count++;
      if (a.severity === "critical") counts[cat].critical++;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
  }, [periodAlerts]);

  if (!hasRole(["ORG_ADMIN"])) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">
            Administrator Access Required
          </h3>
          <p className="text-muted-foreground">
            This report is only available to administrators.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => router.push("/dashboard/reports")}
          >
            Back to Reports
          </Button>
        </div>
      </div>
    );
  }

  const RANGE_OPTS: { label: string; value: DateRange }[] = [
    { label: "Last 7 days", value: "7d" },
    { label: "Last 30 days", value: "30d" },
    { label: "Last 90 days", value: "90d" },
  ];

  const exportReport = () => {
    const doc = new jsPDF();

    // Title
    doc.setFontSize(20);
    doc.setTextColor(59, 130, 246);
    doc.text("EdgePulse Executive Security Summary", 14, 20);

    // Metadata
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Period: Last ${days} days`, 14, 28);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 34);

    // Key Metrics Section
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Key Metrics", 14, 45);

    doc.setFontSize(10);
    doc.setTextColor(60);
    const metricsData = [
      ["Total Alerts", metrics.total.toString()],
      ["Critical Alerts", metrics.critical.toString()],
      ["Resolution Rate", `${metrics.resRate}%`],
      ["Avg Inference Latency", `${metrics.avgLatency}ms`],
      ["Online Devices", `${metrics.onlineDevices}/${devices.length}`],
      ["Devices At Risk", metrics.atRisk.toString()],
    ];

    autoTable(doc, {
      startY: 50,
      head: [["Metric", "Value"]],
      body: metricsData,
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 },
    });

    // Threat Categories Section
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Threat Categories", 14, 115);

    const threatData = topThreats.map(([cat, data]) => [
      cat,
      data.count.toString(),
      data.critical.toString(),
    ]);

    autoTable(doc, {
      startY: 120,
      head: [["Category", "Total", "Critical"]],
      body: threatData,
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 },
    });

    doc.save(
      `executive-summary-${dateRange}-${new Date().toISOString().split("T")[0]}.pdf`,
    );
    setExporting(false);
  };

  return (
    <div className="max-w-300 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/dashboard/reports")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-violet-500" />
              Executive Security Summary
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Organization-wide security posture and threat intelligence
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
            {RANGE_OPTS.map((o) => (
              <button
                key={o.value}
                onClick={() => setDateRange(o.value)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  dateRange === o.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={exportReport}
            disabled={exporting}
          >
            {exporting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <StatCard
            title="Total Alerts"
            value={metrics.total.toString()}
            delta={pct(metrics.total, metrics.prevTotal)}
            positive={trend(metrics.total, metrics.prevTotal)}
            icon={ShieldAlert}
            color="text-destructive"
            bg="bg-destructive/5 border-destructive/15"
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
        >
          <StatCard
            title="Critical Threats"
            value={metrics.critical.toString()}
            delta={`${metrics.critical} critical`}
            positive={metrics.critical === 0}
            icon={AlertTriangle}
            color="text-orange-500"
            bg="bg-orange-500/5 border-orange-500/15"
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
        >
          <StatCard
            title="Resolution Rate"
            value={`${metrics.resRate}%`}
            delta={metrics.resRate >= 80 ? "On target" : "Below target"}
            positive={metrics.resRate >= 80}
            icon={CheckCircle2}
            color="text-green-500"
            bg="bg-green-500/5 border-green-500/15"
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <StatCard
            title="Devices Enrolled"
            value={devices.length.toString()}
            delta={`${metrics.onlineDevices} online`}
            positive={metrics.onlineDevices > 0}
            icon={MonitorSmartphone}
            color="text-primary"
            bg="bg-primary/5 border-primary/15"
          />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="xl:col-span-2 bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Alert Activity — {days}-Day Trend
            </h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-destructive" />
                Detected
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Resolved
              </span>
            </div>
          </div>
          <div className="p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weeklyTrend}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                barGap={2}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                />
                <Bar
                  dataKey="detected"
                  name="Detected"
                  fill="#ef4444"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={16}
                />
                <Bar
                  dataKey="resolved"
                  name="Resolved"
                  fill="#22c55e"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={16}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Resolution Rate
            </h3>
          </div>
          <div className="flex flex-col items-center justify-center p-4 h-56">
            <div className="relative w-full h-36">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="55%"
                  outerRadius="90%"
                  data={resolutionGauge}
                  startAngle={210}
                  endAngle={-30}
                  barSize={14}
                >
                  <RadialBar
                    dataKey="value"
                    cornerRadius={8}
                    background={{ fill: "hsl(var(--muted))" }}
                    isAnimationActive
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className={cn(
                    "text-3xl font-bold font-display",
                    metrics.resRate >= 80
                      ? "text-green-500"
                      : metrics.resRate >= 50
                        ? "text-amber-500"
                        : "text-destructive",
                  )}
                >
                  {metrics.resRate}%
                </span>
                <span className="text-[10px] text-muted-foreground">
                  resolved
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full mt-1">
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">
                  {metrics.resolved}
                </p>
                <p className="text-[10px] text-muted-foreground">Closed</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-destructive">
                  {metrics.total - metrics.resolved}
                </p>
                <p className="text-[10px] text-muted-foreground">Open</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Severity Distribution
            </h3>
          </div>
          <div className="p-4 h-48 flex items-center">
            {sevDist.length > 0 ? (
              <>
                <div className="flex-1 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sevDist}
                        cx="50%"
                        cy="50%"
                        innerRadius="50%"
                        outerRadius="80%"
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {sevDist.map((e, i) => (
                          <Cell key={i} fill={e.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => [
                          typeof v === "number" ? v : 0,
                          "Alerts",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 pl-2">
                  {sevDist.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center gap-2 text-xs"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: d.color }}
                      />
                      <span className="text-muted-foreground capitalize w-12">
                        {d.name}
                      </span>
                      <span className="font-bold text-foreground">
                        {d.value}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-muted-foreground">
                  No alerts in period
                </p>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Threats by Source
            </h3>
          </div>
          <div className="p-4 h-48">
            {threatsBySource.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={threatsBySource}
                  layout="vertical"
                  margin={{ left: 0, right: 12 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Bar
                    dataKey="value"
                    name="Alerts"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={20}
                  >
                    {threatsBySource.map((_, i) => (
                      <Cell
                        key={i}
                        fill={
                          ["#06b6d4", "#8b5cf6", "#f59e0b", "#22c55e"][i % 4]
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-muted-foreground">No data</p>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Fleet Overview
            </h3>
          </div>
          <div className="p-5 space-y-4">
            {[
              {
                label: "Online Devices",
                value: `${metrics.onlineDevices}/${devices.length}`,
                pct:
                  devices.length > 0
                    ? (metrics.onlineDevices / devices.length) * 100
                    : 0,
                color: "bg-green-500",
              },
              {
                label: "At Risk",
                value: `${metrics.atRisk} devices`,
                pct:
                  devices.length > 0
                    ? (metrics.atRisk / devices.length) * 100
                    : 0,
                color: "bg-destructive",
              },
              {
                label: "Online",
                value: `${devices.filter((d) => d.status === "online").length}/${devices.length}`,
                pct:
                  devices.length > 0
                    ? (devices.filter((d) => d.status === "online").length /
                        devices.length) *
                      100
                    : 0,
                color: "bg-primary",
              },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">
                    {item.label}
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {item.value}
                  </span>
                </div>
                {item.pct > 0 && (
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={cn("h-full rounded-full", item.color)}
                      initial={{ width: 0 }}
                      animate={{ width: `${item.pct}%` }}
                      transition={{ duration: 0.7, delay: 0.4 }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {topThreats.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.44 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Top Threat Categories
            </h3>
          </div>
          <div className="divide-y divide-border">
            {topThreats.map(([cat, stats], i) => (
              <div key={cat} className="flex items-center gap-4 px-5 py-3.5">
                <span className="text-xs font-bold text-muted-foreground w-4 text-right">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {cat}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-destructive rounded-full"
                        style={{
                          width: `${topThreats.length > 0 ? (stats.count / topThreats[0][1].count) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  <span className="font-bold text-foreground">
                    {stats.count} alerts
                  </span>
                  {stats.critical > 0 && (
                    <span className="font-bold text-destructive">
                      {stats.critical} critical
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-card border border-border rounded-2xl p-5"
      >
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-500" /> ML Detection Performance
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              label: "Model Version",
              value: "v2.4.1",
              color: "text-green-500",
            },
            {
              label: "Detection Accuracy",
              value: "99.9%",
              color: "text-green-500",
            },
            {
              label: "Avg Inference",
              value: `${metrics.avgLatency}ms`,
              color: "text-primary",
            },
            {
              label: "Detections (period)",
              value: metrics.total.toString(),
              color: "text-violet-500",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="text-center p-3 bg-muted/30 rounded-xl"
            >
              <p className={cn("text-xl font-bold font-display", s.color)}>
                {s.value}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
