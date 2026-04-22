"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Alert } from "@/lib/supabase/types";
import {
    ShieldAlert,
    MonitorSmartphone,
    Zap,
    Shield,
    TrendingUp,
    TrendingDown,
    Activity,
    AlertTriangle,
    CheckCircle2,
    Clock,
    ChevronRight,
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
    RadialBarChart,
    RadialBar,
} from "recharts";
import { useAlertStore } from "@/lib/stores/alert-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useAuth } from "@/lib/auth/useAuth";

function AnomalyTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
            <p className="text-muted-foreground mb-1">{label}</p>
            <p className="font-bold text-primary">{payload[0].value} anomalies</p>
        </div>
    );
}

function SeverityTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
            <p className="font-bold text-foreground">{payload[0].name}</p>
            <p className="text-muted-foreground">{payload[0].value} alerts</p>
        </div>
    );
}

function StatCard({
    title,
    value,
    delta,
    deltaPositive,
    icon: Icon,
    accent,
    accentBg,
    accentBorder,
    href,
    index,
}: {
    title: string;
    value: string;
    delta: string;
    deltaPositive: boolean;
    icon: React.ElementType;
    accent: string;
    accentBg: string;
    accentBorder: string;
    href: string | null;
    index: number;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.45, ease: "easeOut" }}
            whileHover={{ y: -3, transition: { duration: 0.15 } }}
            onClick={() => href && (window.location.href = href)}
            className={`bg-card border border-border rounded-2xl p-5 hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30 transition-shadow relative overflow-hidden ${href ? "cursor-pointer" : ""}`}
        >
            {/* Subtle glow accent */}
            <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full ${accentBg} blur-2xl opacity-60 pointer-events-none`} />

            <div className="relative">
                <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${accentBg} ${accentBorder}`}>
                        <Icon className={`h-5 w-5 ${accent}`} />
                    </div>
                    <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full ${deltaPositive ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"}`}>
                        {deltaPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {delta}
                    </span>
                </div>
                <p className="text-2xl font-bold font-display text-foreground mb-0.5">{value}</p>
                <p className="text-xs text-muted-foreground">{title}</p>
            </div>
        </motion.div>
    );
}

export default function DashboardPage() {
    useEffect(() => {
        document.title = "Security Dashboard - EdgePulse";
    }, []);

    const { user } = useAuth();
    const initialized = useRef(false);

    const { initialize: initAlerts, alerts, pendingCount, loading: alertsLoading } = useAlertStore();
    const { initialize: initDevices, devices, onlineCount, loading: devicesLoading } = useDeviceStore();

    const [tick, setTick] = useState(() => Date.now());

    useEffect(() => {
        if (!user || initialized.current) return;
        initialized.current = true;
        initAlerts();
        initDevices();
    }, [user, initAlerts, initDevices]);

    useEffect(() => {
        const id = setInterval(() => setTick(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    const activeAlerts = useMemo(() => alerts.filter((a) => a.status !== "CLOSED").length, [alerts]);
    const anomaliesResolved = useMemo(() => alerts.filter((a) => a.status === "CLOSED").length, [alerts]);
    const today = useMemo(() => new Date().toDateString(), []);
    const resolvedToday = useMemo(() => alerts.filter(
        (a) => a.status === "CLOSED" && a.closed_at && new Date(a.closed_at).toDateString() === today
    ).length, [alerts, today]);
    const latencyAlerts = useMemo(() => alerts.filter((a) => a.inference_latency_ms > 0).slice(0, 50), [alerts]);
    const avgLatency = useMemo(() => latencyAlerts.length > 0
        ? Math.round(latencyAlerts.reduce((s: number, a: Alert) => s + a.inference_latency_ms, 0) / latencyAlerts.length)
        : 0, [latencyAlerts]);

    // 24-hour anomaly trend
    const anomalyTrend = useMemo(() => {
        const now = tick;
        return Array.from({ length: 24 }, (_, i) => {
            const label = i === 23 ? "Now" : `${23 - i}h`;
            const count = alerts.filter((a) => {
                const diff = Math.floor((now - new Date(a.created_at).getTime()) / 3_600_000);
                return diff === 23 - i;
            }).length;
            return { label, count };
        });
    }, [alerts, tick]);

    // 7-day trend
    const weeklyTrend = useMemo(() => {
        const now = tick;
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(now - (6 - i) * 86_400_000);
            const count = alerts.filter((a) => {
                const ad = new Date(a.created_at);
                return ad.toDateString() === d.toDateString();
            }).length;
            const resolved = alerts.filter((a) => {
                const cd = a.closed_at ? new Date(a.closed_at) : null;
                return cd && cd.toDateString() === d.toDateString();
            }).length;
            return { day: days[d.getDay()], detected: count, resolved };
        });
    }, [alerts, tick]);

    const severityData = useMemo(() => {
        const active = alerts.filter((a) => a.status !== "CLOSED");
        const counts = {
            critical: active.filter((a) => a.severity === "critical").length,
            high: active.filter((a) => a.severity === "high").length,
            medium: active.filter((a) => a.severity === "medium").length,
            low: active.filter((a) => a.severity === "low").length,
        };
        return [
            { name: "Critical", value: counts.critical, color: "#ef4444" },
            { name: "High", value: counts.high, color: "#f97316" },
            { name: "Medium", value: counts.medium, color: "#f59e0b" },
            { name: "Low", value: counts.low, color: "#06b6d4" },
        ].filter((d) => d.value > 0);
    }, [alerts]);

    const deviceRisk = useMemo(() => {
        const counts = {
            clean: devices.filter((d) => !d.risk || d.risk === "none").length,
            low: devices.filter((d) => d.risk === "low").length,
            medium: devices.filter((d) => d.risk === "medium").length,
            high: devices.filter((d) => d.risk === "high").length,
            critical: devices.filter((d) => d.risk === "critical").length,
        };
        return [
            { name: "Clean", value: counts.clean, fill: "#22c55e" },
            { name: "Low", value: counts.low, fill: "#06b6d4" },
            { name: "Medium", value: counts.medium, fill: "#f59e0b" },
            { name: "High", value: counts.high, fill: "#f97316" },
            { name: "Critical", value: counts.critical, fill: "#ef4444" },
        ].filter((d) => d.value > 0);
    }, [devices]);

    const sourceBreakdown = useMemo(() => {
        const sources: Record<string, number> = {};
        alerts.forEach((a) => {
            const src = a.telemetry_source || "UNKNOWN";
            sources[src] = (sources[src] || 0) + 1;
        });
        return Object.entries(sources).map(([name, value]) => ({ name, value }));
    }, [alerts]);

    const recentCritical = useMemo(() =>
        alerts
            .filter((a) => (a.severity === "critical" || a.severity === "high") && a.status !== "CLOSED")
            .slice(0, 5),
        [alerts]
    );

    const responseRate = useMemo(() => {
        if (!alerts.length) return 0;
        return Math.round((anomaliesResolved / alerts.length) * 100);
    }, [alerts, anomaliesResolved]);

    const radialData = useMemo(() => [{ name: "Rate", value: responseRate, fill: "#06b6d4" }], [responseRate]);

    const stats = useMemo(() => [
        {
            title: "Total Devices",
            value: devicesLoading ? "—" : devices.length.toLocaleString(),
            delta: devicesLoading ? "Loading…" : `${onlineCount} online`,
            deltaPositive: true,
            icon: MonitorSmartphone,
            accent: "text-primary",
            accentBg: "bg-primary/10",
            accentBorder: "border-primary/20",
            href: "/dashboard/devices",
        },
        {
            title: "Active Alerts",
            value: alertsLoading ? "—" : activeAlerts.toString(),
            delta: alertsLoading ? "Loading…" : `${pendingCount} pending`,
            deltaPositive: pendingCount === 0,
            icon: ShieldAlert,
            accent: "text-destructive",
            accentBg: "bg-destructive/10",
            accentBorder: "border-destructive/20",
            href: "/dashboard/alerts",
        },
        {
            title: "Mean Inference",
            value: avgLatency ? `${avgLatency}ms` : "—",
            delta: "Edge latency",
            deltaPositive: avgLatency < 500,
            icon: Zap,
            accent: "text-green-500",
            accentBg: "bg-green-500/10",
            accentBorder: "border-green-500/20",
            href: null,
        },
        {
            title: "Anomalies Resolved",
            value: alertsLoading ? "—" : anomaliesResolved.toLocaleString(),
            delta: alertsLoading ? "Loading…" : `${resolvedToday} today`,
            deltaPositive: true,
            icon: Shield,
            accent: "text-violet-500",
            accentBg: "bg-violet-500/10",
            accentBorder: "border-violet-500/20",
            href: null,
        },
    ], [devices, onlineCount, activeAlerts, pendingCount, avgLatency, anomaliesResolved, resolvedToday, devicesLoading, alertsLoading]);

    const relativeTime = (iso: string) => {
        const diff = tick - new Date(iso).getTime();
        const m = Math.floor(diff / 60_000);
        if (m < 1) return "just now";
        if (m < 60) return `${m}m ago`;
        return `${Math.floor(m / 60)}h ago`;
    };

    return (
        <div className="space-y-5 max-w-[1400px]">

            {/* ── Header ── */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
                <div>
                    <h1 className="text-xl lg:text-2xl font-display font-bold text-foreground">
                        Security Overview
                    </h1>
                    <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
                        {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </p>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 self-start sm:self-auto">
                    <Activity className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">Live Monitoring</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                </div>
            </motion.div>

            {/* ── Stat Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                {stats.map((stat, i) => (
                    <StatCard key={stat.title} {...stat} index={i} />
                ))}
            </div>

            {/* ── Row 1: Anomaly Trend (wide) + Response Rate (narrow) ── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

                {/* 24h Anomaly Trend */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="xl:col-span-2 bg-card border border-border rounded-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Anomaly Activity — 24h</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {anomalyTrend.reduce((s, d) => s + d.count, 0)} total detections
                            </p>
                        </div>
                        <TrendingUp className="h-4 w-4 text-primary" />
                    </div>
                    <div className="p-4 h-52">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={anomalyTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={3} />
                                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip content={<AnomalyTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="count"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2}
                                    fill="url(#areaGrad)"
                                    dot={false}
                                    activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Response Rate Gauge */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Resolution Rate</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">Alerts resolved</p>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </div>
                    <div className="flex flex-col items-center justify-center p-4 h-52">
                        <div className="relative w-full h-36">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadialBarChart
                                    innerRadius="55%"
                                    outerRadius="90%"
                                    data={radialData}
                                    startAngle={210}
                                    endAngle={-30}
                                    barSize={14}
                                >
                                    {/* Background track */}
                                    <RadialBar
                                        dataKey="value"
                                        cornerRadius={8}
                                        background={{ fill: "hsl(var(--muted))" }}
                                        isAnimationActive
                                    />
                                </RadialBarChart>
                            </ResponsiveContainer>
                            {/* Center label */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-3xl font-bold font-display text-primary">{responseRate}%</span>
                                <span className="text-[10px] text-muted-foreground">resolved</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 w-full mt-1">
                            <div className="text-center">
                                <p className="text-lg font-bold text-foreground">{anomaliesResolved}</p>
                                <p className="text-[10px] text-muted-foreground">Closed</p>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold text-destructive">{activeAlerts}</p>
                                <p className="text-[10px] text-muted-foreground">Open</p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* ── Row 2: Weekly bar + Severity pie + Source bar ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* 7-day detected vs resolved */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.32 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Detected vs Resolved</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">Last 7 days</p>
                        </div>
                        <BarChartIcon className="h-4 w-4 text-violet-500" />
                    </div>
                    <div className="p-4 h-52">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={weeklyTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={2}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                <XAxis dataKey="day" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                                    cursor={{ fill: "hsl(var(--muted)/0.4)" }}
                                />
                                <Bar dataKey="detected" name="Detected" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={14} />
                                <Bar dataKey="resolved" name="Resolved" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={14} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Severity Distribution Donut */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.38 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Severity Distribution</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">Active alerts</p>
                        </div>
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="p-4 h-52 flex items-center gap-4">
                        {severityData.length > 0 ? (
                            <>
                                <div className="flex-1 h-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={severityData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius="50%"
                                                outerRadius="80%"
                                                paddingAngle={3}
                                                dataKey="value"
                                                strokeWidth={0}
                                            >
                                                {severityData.map((entry, i) => (
                                                    <Cell key={i} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<SeverityTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-col gap-2 shrink-0">
                                    {severityData.map((d) => (
                                        <div key={d.name} className="flex items-center gap-2 text-xs">
                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                                            <span className="text-muted-foreground w-14">{d.name}</span>
                                            <span className="font-bold text-foreground">{d.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center gap-2">
                                <Shield className="h-8 w-8 text-green-500/40" />
                                <p className="text-xs text-muted-foreground">No active alerts</p>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Detection Source */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.44 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Detection Source</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">By telemetry type</p>
                        </div>
                        <Activity className="h-4 w-4 text-primary" />
                    </div>
                    <div className="p-4 h-52">
                        {sourceBreakdown.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={sourceBreakdown}
                                    layout="vertical"
                                    margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={60} />
                                    <Tooltip
                                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                                    />
                                    <Bar dataKey="value" name="Alerts" radius={[0, 4, 4, 0]} maxBarSize={18}>
                                        {sourceBreakdown.map((_, i) => (
                                            <Cell key={i} fill={["#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444"][i % 4]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center gap-2">
                                <Activity className="h-8 w-8 text-muted-foreground/20" />
                                <p className="text-xs text-muted-foreground">No data</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* ── Row 3: Device Risk Bars + Critical Alert Feed ── */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

                {/* Device Risk Breakdown */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.48 }}
                    className="xl:col-span-2 bg-card border border-border rounded-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Device Risk Profile</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{devices.length} total enrolled</p>
                        </div>
                        <MonitorSmartphone className="h-4 w-4 text-primary" />
                    </div>
                    <div className="p-5 space-y-3">
                        {deviceRisk.length > 0 ? deviceRisk.map((d) => {
                            const pct = devices.length > 0 ? (d.value / devices.length) * 100 : 0;
                            return (
                                <div key={d.name}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-muted-foreground">{d.name}</span>
                                        <span className="text-xs font-bold text-foreground">{d.value} <span className="font-normal text-muted-foreground">({pct.toFixed(0)}%)</span></span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{ background: d.fill }}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${pct}%` }}
                                            transition={{ duration: 0.7, ease: "easeOut", delay: 0.5 }}
                                        />
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="flex flex-col items-center justify-center py-8 gap-2">
                                <MonitorSmartphone className="h-8 w-8 text-muted-foreground/20" />
                                <p className="text-xs text-muted-foreground">No devices enrolled</p>
                            </div>
                        )}

                        {/* Online/offline split */}
                        {devices.length > 0 && (
                            <div className="pt-3 border-t border-border grid grid-cols-2 gap-3">
                                <div className="text-center bg-green-500/8 rounded-xl p-3 border border-green-500/15">
                                    <p className="text-xl font-bold text-green-500">{onlineCount}</p>
                                    <p className="text-[10px] text-muted-foreground">Online</p>
                                </div>
                                <div className="text-center bg-muted/50 rounded-xl p-3 border border-border">
                                    <p className="text-xl font-bold text-foreground">{devices.length - onlineCount}</p>
                                    <p className="text-[10px] text-muted-foreground">Offline / Other</p>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Critical Alert Feed */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.52 }}
                    className="xl:col-span-3 bg-card border border-border rounded-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Priority Alerts</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">Critical & high severity, unresolved</p>
                        </div>
                        <button
                            onClick={() => (window.location.href = "/dashboard/alerts")}
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                            View all <ChevronRight className="h-3 w-3" />
                        </button>
                    </div>

                    <div className="divide-y divide-border">
                        <AnimatePresence>
                            {recentCritical.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-2">
                                    <Shield className="h-8 w-8 text-green-500/30" />
                                    <p className="text-sm text-muted-foreground">No priority alerts</p>
                                    <p className="text-xs text-muted-foreground/60">All clear — systems nominal</p>
                                </div>
                            ) : (
                                recentCritical.map((alert, i) => {
                                    const isCritical = alert.severity === "critical";
                                    return (
                                        <motion.div
                                            key={alert.id}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.04 }}
                                            className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer"
                                            onClick={() => (window.location.href = `/dashboard/alerts/${alert.id}`)}
                                        >
                                            <div className={`w-1.5 h-8 rounded-full shrink-0 ${isCritical ? "bg-destructive shadow-[0_0_8px_#ef4444]" : "bg-orange-500"}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground truncate">{alert.title}</p>
                                                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                                    <span className="truncate">{alert.device_name}</span>
                                                    <span>·</span>
                                                    <Clock className="h-3 w-3 shrink-0" />
                                                    <span>{relativeTime(alert.created_at)}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 shrink-0">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isCritical ? "bg-destructive/15 text-destructive" : "bg-orange-500/15 text-orange-500"}`}>
                                                    {alert.severity.toUpperCase()}
                                                </span>
                                                <span className="text-[10px] font-mono text-muted-foreground">
                                                    {((alert.anomaly_score ?? alert.confidence ?? 0) * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        </motion.div>
                                    );
                                })
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Summary footer */}
                    <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-destructive" />
                                {alerts.filter((a) => a.severity === "critical" && a.status !== "CLOSED").length} critical
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-orange-500" />
                                {alerts.filter((a) => a.severity === "high" && a.status !== "CLOSED").length} high
                            </span>
                        </div>
                        <span className="text-xs text-muted-foreground">{activeAlerts} total open</span>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

function BarChartIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="18" y="3" width="4" height="18" rx="1" />
            <rect x="10" y="8" width="4" height="13" rx="1" />
            <rect x="2" y="13" width="4" height="8" rx="1" />
        </svg>
    );
}