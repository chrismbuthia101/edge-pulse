"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  RefreshCw,
  Filter,
  Search,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Cpu,
  HardDrive,
} from "lucide-react";
import {
  AreaChart,
  Area,
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
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

import type { DateRange, IntegrityFilter, RiskFilter, StatusFilter } from "@/lib/types/reports";
import { INTEGRITY_COLORS, RISK_COLORS, RANGE_OPTS, cutoffFromDateRange } from "@/lib/utils/report-utils";
import { TooltipBox } from "@/components/ui/TooltipBox";

export default function IntegrityAuditReport() {
  useEffect(() => {
    document.title = "Integrity Audit Report - EdgePulse";
  }, []);
  const router = useRouter();
  const { devices } = useDeviceStore();
  const { alerts } = useAlertStore();
  const initialized = useRef(false);

  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [integrity, setIntegrity] = useState<IntegrityFilter>("all");
  const [risk, setRisk] = useState<RiskFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const { initialize: initDevices } = useDeviceStore();
  const { initialize: initAlerts } = useAlertStore();
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initDevices();
      initAlerts();
    }
  }, [initDevices, initAlerts]);

  const cutoff = useMemo(() => cutoffFromDateRange(dateRange), [dateRange]);

  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      if (risk !== "all" && d.risk !== risk) return false;
      if (status !== "all" && d.status !== status) return false;
      if (search && !d.name.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [devices, risk, status, search]);

  const tamperAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (dateRange !== "all" && new Date(a.created_at) < cutoff) return false;
      return (
        a.category === "TAMPER" ||
        a.title.toLowerCase().includes("tamper") ||
        a.title.toLowerCase().includes("integrity")
      );
    });
  }, [alerts, dateRange, cutoff]);

  const metrics = useMemo(
    () => ({
      totalDevices: filteredDevices.length,
      verified: filteredDevices.filter((d) => d.status === "online").length,
      tampered: filteredDevices.filter(
        (d) => d.status !== "online" && d.status !== "offline",
      ).length,
      unknown: filteredDevices.filter((d) => d.status === "offline").length,
      atRisk: filteredDevices.filter(
        (d) => d.risk === "critical" || d.risk === "high",
      ).length,
      tamperAlerts: tamperAlerts.length,
      verificationRate:
        filteredDevices.length > 0
          ? Math.round(
              (filteredDevices.filter((d) => d.status === "online").length /
                filteredDevices.length) *
                100,
            )
          : 0,
    }),
    [filteredDevices, tamperAlerts],
  );

  const integrityDist = useMemo(() => {
    const counts: Record<string, number> = {
      verified: 0,
      tampered: 0,
      unknown: 0,
    };
    filteredDevices.forEach((d) => {
      if (d.status === "online") counts.verified++;
      else if (d.status === "offline") counts.unknown++;
      else counts.tampered++;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: INTEGRITY_COLORS[name] }));
  }, [filteredDevices]);

  const riskDist = useMemo(() => {
    const counts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    filteredDevices.forEach((d) => {
      if (d.risk && counts[d.risk] !== undefined) counts[d.risk]++;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: RISK_COLORS[name] }));
  }, [filteredDevices]);

  const tamperTrend = useMemo(() => {
    const days =
      dateRange === "7d"
        ? 7
        : dateRange === "30d"
          ? 30
          : dateRange === "90d"
            ? 90
            : 30;
    const buckets: Record<string, { date: string; tamperAlerts: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      buckets[key] = { date: key, tamperAlerts: 0 };
    }
    tamperAlerts.forEach((a) => {
      const key = new Date(a.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      if (buckets[key]) buckets[key].tamperAlerts++;
    });
    return Object.values(buckets);
  }, [tamperAlerts, dateRange]);

  const devicesByRisk = useMemo(() => {
    const counts: Record<
      string,
      { name: string; count: number; tampered: number }
    > = {};
    filteredDevices.forEach((d) => {
      const riskLevel = d.risk || "unknown";
      if (!counts[riskLevel])
        counts[riskLevel] = {
          name: riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1),
          count: 0,
          tampered: 0,
        };
      counts[riskLevel].count++;
      if (d.status !== "online") counts[riskLevel].tampered++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [filteredDevices]);

  const exportCSV = () => {
    setExporting(true);
    const rows = [
      [
        "Device ID",
        "Name",
        "Integrity Status",
        "Risk Level",
        "Status",
        "CPU %",
        "RAM %",
        "Sync Queue",
        "Last Seen",
      ],
      ...filteredDevices.map((d) => [
        d.id,
        `"${d.name}"`,
        d.status === "online"
          ? "Verified"
          : d.status === "offline"
            ? "Unknown"
            : "Tampered",
        d.risk || "N/A",
        d.status,
        d.cpu_percent ?? "N/A",
        d.ram_percent ?? "N/A",
        d.sync_queue_depth ?? "N/A",
        d.last_seen ? new Date(d.last_seen).toISOString() : "N/A",
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `integrity-audit-${dateRange}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => setExporting(false), 800);
  };

  const exportPDF = () => {
    const doc = new jsPDF();

    // Title
    doc.setFontSize(20);
    doc.setTextColor(59, 130, 246);
    doc.text("EdgePulse Integrity Audit Report", 14, 20);

    // Metadata
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Period: ${dateRange}`, 14, 28);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 34);

    // Summary Section
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Summary", 14, 45);

    doc.setFontSize(10);
    doc.setTextColor(60);
    const summaryData = [
      ["Total Devices", metrics.totalDevices.toString()],
      ["Verified", metrics.verified.toString()],
      ["Tampered", metrics.tampered.toString()],
      ["Unknown", metrics.unknown.toString()],
      ["At Risk", metrics.atRisk.toString()],
      ["Tamper Alerts", metrics.tamperAlerts.toString()],
      ["Verification Rate", `${metrics.verificationRate}%`],
    ];

    autoTable(doc, {
      startY: 50,
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

    const deviceData = filteredDevices.map((d) => [
      d.name,
      d.status === "online"
        ? "Verified"
        : d.status === "offline"
          ? "Unknown"
          : "Tampered",
      d.risk || "none",
      d.status,
    ]);

    autoTable(doc, {
      startY: 115,
      head: [["Name", "Hash Chain", "Risk", "Status"]],
      body: deviceData,
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 30 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
      },
    });

    doc.save(
      `integrity-audit-${dateRange}-${new Date().toISOString().split("T")[0]}.pdf`,
    );
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
              <Shield className="h-5 w-5 text-sky-500" />
              Integrity Audit
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Hash chain verification, tamper detection, and device integrity
              status
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
        <div className="flex flex-wrap items-center gap-3">
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
          <Select
            value={integrity}
            onValueChange={(v) => setIntegrity(v as IntegrityFilter)}
          >
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All integrity</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="tampered">Tampered</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          <Select value={risk} onValueChange={(v) => setRisk(v as RiskFilter)}>
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All risks</SelectItem>
              {["critical", "high", "medium", "low"].map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as StatusFilter)}
          >
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["online", "offline", "isolated"].map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search devices..."
              className="pl-8 h-8 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {[
          {
            label: "Total Devices",
            value: metrics.totalDevices,
            color: "text-foreground",
          },
          {
            label: "Verified",
            value: metrics.verified,
            color: "text-green-500",
          },
          {
            label: "Tampered",
            value: metrics.tampered,
            color: "text-destructive",
          },
          { label: "Unknown", value: metrics.unknown, color: "text-amber-500" },
          { label: "At Risk", value: metrics.atRisk, color: "text-orange-500" },
          {
            label: "Tamper Alerts",
            value: metrics.tamperAlerts,
            color: "text-destructive",
          },
          {
            label: "Verification Rate",
            value: `${metrics.verificationRate}%`,
            color: "text-sky-500",
          },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.04 }}
            className="bg-card border border-border rounded-xl p-3.5"
          >
            <p className={`text-xl font-bold font-display ${s.color}`}>
              {s.value}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
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
          className="xl:col-span-2 bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-sky-500" />
              Tamper Detection Trend
            </h3>
            <span className="text-xs text-muted-foreground">
              {tamperAlerts.length} alerts
            </span>
          </div>
          <div className="p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={tamperTrend}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="tamperGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                <Tooltip content={<TooltipBox />} />
                <Area
                  type="monotone"
                  dataKey="tamperAlerts"
                  name="Tamper Alerts"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  fill="url(#tamperGradient)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
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
              Integrity Distribution
            </h3>
          </div>
          <div className="p-4 h-56 flex items-center">
            {integrityDist.length > 0 ? (
              <>
                <div className="flex-1 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={integrityDist}
                        cx="50%"
                        cy="50%"
                        innerRadius="50%"
                        outerRadius="80%"
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {integrityDist.map((e, i) => (
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
                  {integrityDist.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center gap-2 text-xs"
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: d.color }}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Devices by Risk Level
            </h3>
          </div>
          <div className="p-4 h-52">
            {devicesByRisk.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={devicesByRisk}
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
                    dataKey="count"
                    name="Total"
                    fill="#06b6d4"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={16}
                  />
                  <Bar
                    dataKey="tampered"
                    name="Tampered"
                    fill="#ef4444"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={16}
                  />
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
          transition={{ delay: 0.35 }}
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
                        innerRadius="45%"
                        outerRadius="75%"
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
                <div className="flex flex-col gap-2">
                  {riskDist.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center gap-2 text-xs"
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: d.color }}
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

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-card border border-border rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            Device Integrity Status
          </h3>
          <span className="text-xs text-muted-foreground">
            Showing {filteredDevices.length} devices
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {[
                  "Device",
                  "Hash Chain",
                  "Risk",
                  "Status",
                  "CPU",
                  "RAM",
                  "Sync Queue",
                  "Last Seen",
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
              {filteredDevices.map((d) => {
                const integrityStatus =
                  d.status === "online"
                    ? "verified"
                    : d.status === "offline"
                      ? "unknown"
                      : "tampered";
                const integrityColors: Record<string, string> = {
                  verified: "text-green-500 bg-green-500/10",
                  tampered: "text-destructive bg-destructive/10",
                  unknown: "text-amber-500 bg-amber-500/10",
                };
                const riskColors: Record<string, string> = {
                  critical: "text-destructive bg-destructive/10",
                  high: "text-orange-500 bg-orange-500/10",
                  medium: "text-amber-500 bg-amber-500/10",
                  low: "text-green-500 bg-green-500/10",
                };
                return (
                  <tr
                    key={d.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground max-w-45 truncate">
                      {d.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold capitalize flex items-center gap-1 w-fit",
                          integrityColors[integrityStatus],
                        )}
                      >
                        {integrityStatus === "verified" && (
                          <CheckCircle className="h-3 w-3" />
                        )}
                        {integrityStatus === "tampered" && (
                          <XCircle className="h-3 w-3" />
                        )}
                        {integrityStatus === "unknown" && (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        {integrityStatus}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {d.risk ? (
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-bold capitalize",
                            riskColors[d.risk],
                          )}
                        >
                          {d.risk}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground capitalize">
                      {d.status}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground flex items-center gap-1">
                      <Cpu className="h-3 w-3" />
                      {d.cpu_percent ?? "—"}%
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground flex items-center gap-1">
                      <HardDrive className="h-3 w-3" />
                      {d.ram_percent ?? "—"}%
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {d.sync_queue_depth ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {d.last_seen
                        ? new Date(d.last_seen).toLocaleDateString()
                        : "Never"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredDevices.length === 0 && (
            <div className="py-12 text-center">
              <Shield className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
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
