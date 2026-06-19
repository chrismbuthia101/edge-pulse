"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  RefreshCw,
  Filter,
  MonitorSmartphone,
  Server,
  Laptop,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useAlertStore } from "@/lib/stores/alert-store";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const RISK_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#06b6d4",
  none: "#22c55e",
};

type RiskFilter = "all" | "critical" | "high" | "medium" | "low" | "none";
type StatusFilterT = "all" | "online" | "offline" | "isolated";
type TypeFilter = "all" | "server" | "laptop" | "workstation";

function MiniTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-bold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

export default function DeviceFleetReport() {
  useEffect(() => {
    document.title = "Device Fleet Report - EdgePulse";
  }, []);
  const router = useRouter();
  const { devices, initialize } = useDeviceStore();
  const { alerts } = useAlertStore();
  const initialized = useRef(false);

  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilterT>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initialize();
    }
  }, [initialize]);

  const filtered = useMemo(
    () =>
      devices.filter((d) => {
        if (riskFilter !== "all" && d.risk !== riskFilter) return false;
        if (statusFilter !== "all") {
          if (statusFilter === "online" && d.status !== "online") return false;
          if (statusFilter === "offline" && d.status !== "offline")
            return false;
          if (statusFilter === "isolated" && d.status !== "isolated")
            return false;
        }
        if (typeFilter !== "all" && d.type !== typeFilter) return false;
        return true;
      }),
    [devices, riskFilter, statusFilter, typeFilter],
  );

  const metrics = useMemo(
    () => ({
      total: filtered.length,
      online: filtered.filter((d) => d.status === "online").length,
      offline: filtered.filter((d) => d.status === "offline").length,
      atRisk: filtered.filter((d) => d.risk === "critical" || d.risk === "high")
        .length,
      notOnline: filtered.filter((d) => d.status !== "online").length,
      outdated: filtered.filter(
        (d) => d.agent_version && d.agent_version !== "v2.4.1",
      ).length,
      avgCpu: filtered.length
        ? Math.round(
            filtered.reduce((s, d) => s + (d.cpu_percent ?? 0), 0) /
              filtered.length,
          )
        : 0,
      avgRam: filtered.length
        ? Math.round(
            filtered.reduce((s, d) => s + (d.ram_percent ?? 0), 0) /
              filtered.length,
          )
        : 0,
    }),
    [filtered],
  );

  const riskDist = useMemo(() => {
    const counts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      none: 0,
    };
    filtered.forEach((d) => {
      counts[d.risk ?? "none"] = (counts[d.risk ?? "none"] || 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: RISK_COLORS[name] }));
  }, [filtered]);

  const typeDist = useMemo(() => {
    const counts: Record<string, number> = {
      server: 0,
      laptop: 0,
      workstation: 0,
      other: 0,
    };
    filtered.forEach((d) => {
      counts[d.type ?? "other"] = (counts[d.type ?? "other"] || 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const performanceData = useMemo(() => {
    const online = filtered.filter((d) => d.status === "online");
    const avgCpu = online.length
      ? online.reduce((s, d) => s + (d.cpu_percent ?? 0), 0) / online.length
      : 0;
    const avgRam = online.length
      ? online.reduce((s, d) => s + (d.ram_percent ?? 0), 0) / online.length
      : 0;
    const avgSync = online.length
      ? online.reduce((s, d) => s + (d.sync_queue_depth ?? 0), 0) /
        online.length
      : 0;
    const onlineRate =
      filtered.length > 0
        ? (filtered.filter((d) => d.status === "online").length /
            filtered.length) *
          100
        : 0;
    const reportingRate =
      filtered.length > 0
        ? (filtered.filter((d) => d.status === "online").length /
            filtered.length) *
          100
        : 0;
    return [
      { subject: "CPU Health", value: Math.round(100 - avgCpu), fullMark: 100 },
      { subject: "RAM Health", value: Math.round(100 - avgRam), fullMark: 100 },
      { subject: "Online Rate", value: Math.round(onlineRate), fullMark: 100 },
      {
        subject: "Sync Health",
        value: Math.round(Math.max(0, 100 - avgSync * 5)),
        fullMark: 100,
      },
      { subject: "Reporting", value: Math.round(reportingRate), fullMark: 100 },
    ];
  }, [filtered]);

  const topAlertDevices = useMemo(() => {
    const counts: Record<
      string,
      { name: string; alerts: number; risk: string }
    > = {};
    alerts
      .filter((a) => a.status !== "CLOSED")
      .forEach((a) => {
        const d = devices.find((x) => x.id === a.device_id);
        const name = d?.name || a.device_id;
        if (!counts[a.device_id])
          counts[a.device_id] = { name, alerts: 0, risk: d?.risk ?? "none" };
        counts[a.device_id].alerts++;
      });
    return Object.values(counts)
      .sort((a, b) => b.alerts - a.alerts)
      .slice(0, 8);
  }, [alerts, devices]);

  const exportCSV = () => {
    setExporting(true);
    const rows = [
      [
        "Name",
        "Type",
        "OS",
        "Status",
        "Risk",
        "Agent",
        "CPU%",
        "RAM%",
        "Sync Queue",
        "Online Status",
        "Last Seen",
      ],
      ...filtered.map((d) => [
        d.name,
        d.type ?? "",
        d.os ?? "",
        d.status,
        d.risk ?? "none",
        d.agent_version ?? "",
        d.cpu_percent ?? 0,
        d.ram_percent ?? 0,
        d.sync_queue_depth ?? 0,
        d.status === "online" ? "Online" : "Offline",
        d.last_seen ? new Date(d.last_seen).toISOString() : "",
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `device-fleet-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => setExporting(false), 800);
  };

  const exportPDF = () => {
    const doc = new jsPDF();

    // Title
    doc.setFontSize(20);
    doc.setTextColor(59, 130, 246);
    doc.text("EdgePulse Device Fleet Report", 14, 20);

    // Metadata
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);

    // Summary Section
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Summary", 14, 40);

    doc.setFontSize(10);
    doc.setTextColor(60);
    const summaryData = [
      ["Total Devices", metrics.total.toString()],
      ["Online", metrics.online.toString()],
      ["Offline", metrics.offline.toString()],
      ["At Risk", metrics.atRisk.toString()],
      ["Not Online", metrics.notOnline.toString()],
      ["Outdated Agents", metrics.outdated.toString()],
      ["Avg CPU", `${metrics.avgCpu}%`],
      ["Avg RAM", `${metrics.avgRam}%`],
    ];

    autoTable(doc, {
      startY: 45,
      head: [["Metric", "Value"]],
      body: summaryData,
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 },
    });

    // Device List Section
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Device List", 14, 110);

    const deviceData = filtered.map((d) => [
      d.name,
      d.type || "N/A",
      d.status,
      d.risk || "none",
      d.status === "online" ? "Online" : "Offline",
      d.agent_version || "N/A",
    ]);

    autoTable(doc, {
      startY: 115,
      head: [["Name", "Type", "Status", "Risk", "Online Status", "Agent"]],
      body: deviceData,
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 20 },
        2: { cellWidth: 20 },
        3: { cellWidth: 20 },
        4: { cellWidth: 25 },
        5: { cellWidth: 25 },
      },
    });

    doc.save(
      `device-fleet-report-${new Date().toISOString().split("T")[0]}.pdf`,
    );
  };

  const DeviceTypeIcon = ({ type }: { type: string }) => {
    if (type === "server") return <Server className="h-3.5 w-3.5" />;
    if (type === "laptop") return <Laptop className="h-3.5 w-3.5" />;
    return <MonitorSmartphone className="h-3.5 w-3.5" />;
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
              <MonitorSmartphone className="h-5 w-5 text-primary" />
              Device Fleet Health
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Risk distribution, performance, and compliance metrics
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={exportPDF}
            disabled={exporting}
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={exportCSV}
            disabled={exporting}
          >
            {exporting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export CSV
          </Button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-card border border-border rounded-2xl p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Filters
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          <Select
            value={riskFilter}
            onValueChange={(v) => setRiskFilter(v as RiskFilter)}
          >
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All risk levels</SelectItem>
              {["critical", "high", "medium", "low", "none"].map((r) => (
                <SelectItem key={r} value={r} className="capitalize">
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilterT)}
          >
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="isolated">Isolated</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as TypeFilter)}
          >
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="server">Servers</SelectItem>
              <SelectItem value="laptop">Laptops</SelectItem>
              <SelectItem value="workstation">Workstations</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: "Total", value: metrics.total, color: "text-foreground" },
          { label: "Online", value: metrics.online, color: "text-green-500" },
          {
            label: "Offline",
            value: metrics.offline,
            color: "text-destructive",
          },
          { label: "At Risk", value: metrics.atRisk, color: "text-orange-500" },
          {
            label: "Not Online",
            value: metrics.notOnline,
            color: "text-destructive",
          },
          {
            label: "Outdated Agent",
            value: metrics.outdated,
            color: "text-amber-500",
          },
          {
            label: "Avg CPU",
            value: `${metrics.avgCpu}%`,
            color: "text-primary",
          },
          {
            label: "Avg RAM",
            value: `${metrics.avgRam}%`,
            color: "text-violet-500",
          },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.03 }}
            className="bg-card border border-border rounded-xl p-3"
          >
            <p className={`text-lg font-bold font-display ${s.color}`}>
              {s.value}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
              {s.label}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Risk Distribution
            </h3>
          </div>
          <div className="p-4 h-52 flex items-center">
            {riskDist.length > 0 ? (
              <>
                <div className="flex-1 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={riskDist}
                        cx="50%"
                        cy="50%"
                        innerRadius="50%"
                        outerRadius="80%"
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {riskDist.map((e, i) => (
                          <Cell key={i} fill={e.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => [
                          typeof v === "number" ? v : 0,
                          "Devices",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 pl-2">
                  {riskDist.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center gap-2 text-xs"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: d.color }}
                      />
                      <span className="text-muted-foreground capitalize w-14">
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
                <p className="text-xs text-muted-foreground">No data</p>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Fleet Health Radar
            </h3>
          </div>
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                data={performanceData}
                margin={{ top: 0, right: 8, bottom: 0, left: 8 }}
              >
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                />
                <Radar
                  dataKey="value"
                  stroke="#06b6d4"
                  fill="#06b6d4"
                  fillOpacity={0.25}
                  strokeWidth={1.5}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Device Type Breakdown
            </h3>
          </div>
          <div className="p-4 h-52 flex items-center">
            {typeDist.length > 0 ? (
              <>
                <div className="flex-1 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={typeDist}
                        cx="50%"
                        cy="50%"
                        innerRadius="40%"
                        outerRadius="75%"
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {typeDist.map((_, i) => (
                          <Cell
                            key={i}
                            fill={
                              ["#06b6d4", "#8b5cf6", "#f59e0b", "#22c55e"][
                                i % 4
                              ]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => [
                          typeof v === "number" ? v : 0,
                          "Devices",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 pl-2">
                  {typeDist.map((d, i) => (
                    <div
                      key={d.name}
                      className="flex items-center gap-2 text-xs"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{
                          background: [
                            "#06b6d4",
                            "#8b5cf6",
                            "#f59e0b",
                            "#22c55e",
                          ][i % 4],
                        }}
                      />
                      <span className="text-muted-foreground capitalize w-16">
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
                <p className="text-xs text-muted-foreground">No data</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {topAlertDevices.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Devices with Most Active Alerts
            </h3>
          </div>
          <div className="p-4 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topAlertDevices}
                layout="vertical"
                margin={{ left: 0, right: 16 }}
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
                  width={90}
                />
                <Tooltip content={<MiniTooltip />} />
                <Bar
                  dataKey="alerts"
                  name="Active Alerts"
                  fill="#ef4444"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={14}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-card border border-border rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            Device Inventory
          </h3>
          <span className="text-xs text-muted-foreground">
            {filtered.length} devices
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {[
                  "Device",
                  "Type",
                  "OS",
                  "Status",
                  "Risk",
                  "CPU",
                  "RAM",
                  "Sync",
                  "Online",
                  "Agent",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.slice(0, 100).map((d) => {
                const riskCls: Record<string, string> = {
                  critical: "text-destructive bg-destructive/10",
                  high: "text-orange-500 bg-orange-500/10",
                  medium: "text-amber-500 bg-amber-500/10",
                  low: "text-primary bg-primary/10",
                  none: "text-green-500 bg-green-500/10",
                };
                const stCls: Record<string, string> = {
                  online: "text-green-500",
                  offline: "text-destructive",
                  isolated: "text-orange-500",
                  gone_silent: "text-amber-500",
                  unsynced: "text-blue-500",
                };
                return (
                  <tr
                    key={d.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        <DeviceTypeIcon type={d.type ?? "workstation"} />
                        {d.name}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground capitalize">
                      {d.type}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {d.os}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "flex items-center gap-1",
                          stCls[d.status ?? "offline"],
                        )}
                      >
                        {d.status === "online" ? (
                          <Wifi className="h-3 w-3" />
                        ) : (
                          <WifiOff className="h-3 w-3" />
                        )}
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold capitalize",
                          riskCls[d.risk ?? "none"],
                        )}
                      >
                        {d.risk ?? "none"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono">
                      <span
                        className={
                          d.cpu_percent > 80
                            ? "text-destructive"
                            : "text-foreground"
                        }
                      >
                        {d.cpu_percent ?? 0}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono">
                      <span
                        className={
                          d.ram_percent > 80
                            ? "text-orange-500"
                            : "text-foreground"
                        }
                      >
                        {d.ram_percent ?? 0}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-foreground">
                      {d.sync_queue_depth ?? 0}
                    </td>
                    <td className="px-4 py-2.5">
                      {d.status === "online" ? (
                        <span className="flex items-center gap-1 text-green-500">
                          <Wifi className="h-3 w-3" />
                          Online
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-destructive">
                          <WifiOff className="h-3 w-3" />
                          Offline
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">
                      {d.agent_version}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <MonitorSmartphone className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No devices match your filters
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
