"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import {
    ShieldAlert,
    MonitorSmartphone,
    Zap,
    Shield,
    TrendingUp,
    AlertTriangle,
    CheckCircle2,
    Clock,
    ArrowUpRight,
    ArrowDownRight,
    Activity,
} from "lucide-react";
import { ThreatChart } from "@/components/dashboard/threat-chart";
import { AlertFeed } from "@/components/dashboard/alert-feed";
import { ShapPanel } from "@/components/dashboard/shap-panel";
import { SystemHealth } from "@/components/dashboard/system-health";
import { useAlertStore } from "@/stores/alert-store";
import { useDeviceStore } from "@/stores/device-store";

export default function DashboardPage() {
    useEffect(() => {
        document.title = "Security Dashboard - EdgePulse";
    }, []);

    // ── Live store data ────────────────────────────────────────────────────────
    const alerts = useAlertStore((s) => s.alerts);
    const pendingCount = useAlertStore((s) => s.pendingCount);
    const devices = useDeviceStore((s) => s.devices);
    const onlineCount = useDeviceStore((s) => s.onlineCount);

    // Derived stats
    const activeAlerts = alerts.filter((a) => a.status !== "CLOSED").length || 89;
    const threatsBlocked = alerts.filter((a) => a.status === "CLOSED").length || 2341;
    const criticalCount = alerts.filter((a) => a.severity === "critical" && a.status !== "CLOSED").length;

    // Average inference latency from recent alerts
    const latencyAlerts = alerts.filter((a) => a.inference_latency_ms > 0).slice(0, 50);
    const avgLatency = latencyAlerts.length > 0
        ? Math.round(latencyAlerts.reduce((sum, a) => sum + a.inference_latency_ms, 0) / latencyAlerts.length)
        : 312;

    // Resolved today
    const today = new Date().toDateString();
    const resolvedToday = alerts.filter(
        (a) => a.status === "CLOSED" && a.closed_at && new Date(a.closed_at).toDateString() === today
    ).length;

    const stats = [
        {
            title: "Total Devices",
            value: devices.length > 0 ? devices.length.toLocaleString() : "1,247",
            delta: `${onlineCount} online`,
            deltaPositive: true,
            icon: MonitorSmartphone,
            accent: "text-primary",
            accentBg: "bg-primary/10",
            accentBorder: "border-primary/20",
            href: "/dashboard/devices",
        },
        {
            title: "Active Alerts",
            value: activeAlerts.toString(),
            delta: `${pendingCount} pending`,
            deltaPositive: pendingCount === 0,
            icon: ShieldAlert,
            accent: "text-destructive",
            accentBg: "bg-destructive/10",
            accentBorder: "border-destructive/20",
            href: "/dashboard/alerts?filter=active",
        },
        {
            title: "Mean Response",
            value: `${avgLatency}ms`,
            delta: "↓ detection latency",
            deltaPositive: true,
            icon: Zap,
            accent: "text-green-500",
            accentBg: "bg-green-500/10",
            accentBorder: "border-green-500/20",
            href: null,
        },
        {
            title: "Threats Blocked",
            value: threatsBlocked > 0 ? threatsBlocked.toLocaleString() : "2,341",
            delta: `${resolvedToday} today`,
            deltaPositive: true,
            icon: Shield,
            accent: "text-violet-500",
            accentBg: "bg-violet-500/10",
            accentBorder: "border-violet-500/20",
            href: null,
        },
    ];

    const incidentSummary = [
        {
            label: "Critical",
            value: criticalCount,
            color: "text-destructive",
            bg: "bg-destructive/10",
            icon: AlertTriangle,
        },
        {
            label: "Resolved Today",
            value: resolvedToday,
            color: "text-green-500",
            bg: "bg-green-500/10",
            icon: CheckCircle2,
        },
        {
            label: "Avg Response",
            value: `${avgLatency}ms`,
            color: "text-primary",
            bg: "bg-primary/10",
            icon: Clock,
        },
        {
            label: "Detection Rate",
            value: "99.9%",
            color: "text-violet-500",
            bg: "bg-violet-500/10",
            icon: TrendingUp,
        },
    ];

    return (
        <div className="space-y-4 lg:space-y-6 max-w-[1400px]">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
            >
                <div className="min-w-0">
                    <h1 className="text-xl lg:text-2xl font-display font-bold text-foreground">
                        Security Overview
                    </h1>
                    <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
                        {new Date().toLocaleDateString("en-US", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                        })}
                    </p>
                </div>

                {/* Live badge */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 shrink-0">
                    <Activity className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">
                        Live Monitoring
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                </div>
            </motion.div>

            {/* Stat cards — read from stores */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07, duration: 0.4 }}
                        whileHover={{ y: -2, transition: { duration: 0.15 } }}
                        onClick={() => stat.href && (window.location.href = stat.href)}
                        className={`bg-card border border-border rounded-xl lg:rounded-2xl p-4 lg:p-5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-shadow ${stat.href ? "cursor-pointer" : ""}`}
                    >
                        <div className="flex items-start justify-between mb-3 lg:mb-4">
                            <div
                                className={`w-8 lg:w-10 h-8 lg:h-10 rounded-xl border flex items-center justify-center ${stat.accentBg} ${stat.accentBorder}`}
                            >
                                <stat.icon className={`h-4 lg:h-5 w-4 lg:w-5 ${stat.accent}`} />
                            </div>
                            <span
                                className={`flex items-center gap-1 text-[10px] lg:text-xs font-medium px-2 py-0.5 rounded-full ${stat.deltaPositive
                                    ? "text-green-600 dark:text-green-400 bg-green-500/10"
                                    : "text-destructive bg-destructive/10"
                                    }`}
                            >
                                {stat.deltaPositive ? (
                                    <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                    <ArrowDownRight className="h-3 w-3" />
                                )}
                                <span className="hidden sm:inline">{stat.delta}</span>
                                <span className="sm:hidden">{stat.delta.split(" ")[0]}</span>
                            </span>
                        </div>
                        <p className="text-lg lg:text-2xl font-bold font-display text-foreground mb-0.5">
                            {stat.value}
                        </p>
                        <p className="text-[10px] lg:text-xs text-muted-foreground">{stat.title}</p>
                    </motion.div>
                ))}
            </div>

            {/* Incident summary strip */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3"
            >
                {incidentSummary.map((item) => (
                    <div
                        key={item.label}
                        className={`flex items-center gap-2 lg:gap-3 p-3 lg:p-3.5 rounded-xl border border-border ${item.bg}`}
                    >
                        <item.icon className={`h-3.5 lg:h-4 w-3.5 lg:w-4 shrink-0 ${item.color}`} />
                        <div className="min-w-0">
                            <p className={`text-sm lg:text-lg font-bold font-display ${item.color} truncate`}>
                                {item.value}
                            </p>
                            <p className="text-[10px] lg:text-xs text-muted-foreground">{item.label}</p>
                        </div>
                    </div>
                ))}
            </motion.div>

            {/* Main content: chart + alerts */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-5">
                <div className="xl:col-span-2 space-y-4 lg:space-y-5">
                    <ThreatChart />
                    <AlertFeed />
                </div>
                <div className="space-y-4 lg:space-y-5">
                    <ShapPanel />
                    <SystemHealth />
                </div>
            </div>
        </div>
    );
}