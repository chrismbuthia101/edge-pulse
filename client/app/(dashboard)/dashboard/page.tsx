"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo } from "react";
import type { Alert } from "@/lib/supabase/types";
import {
    ShieldAlert,
    MonitorSmartphone,
    Zap,
    Shield,
    ArrowUpRight,
    ArrowDownRight,
    Activity,
} from "lucide-react";
import { AnomalyChart } from "@/components/dashboard/anomaly-chart";
import { AlertFeed } from "@/components/dashboard/alert-feed";
import { ShapPanel } from "@/components/dashboard/shap-panel";
import { SystemHealth } from "@/components/dashboard/system-health";
import { useAlertStore } from "@/stores/alert-store";
import { useDeviceStore } from "@/stores/device-store";

export default function DashboardPage() {
    useEffect(() => {
        document.title = "Security Dashboard - EdgePulse";
    }, []);

    const alerts = useAlertStore((s) => s.alerts);
    const pendingCount = useAlertStore((s) => s.pendingCount);
    const devices = useDeviceStore((s) => s.devices);
    const onlineCount = useDeviceStore((s) => s.onlineCount);

    const activeAlerts = useMemo(() => alerts.filter((a) => a.status !== "CLOSED").length, [alerts]);
    const anomaliesResolved = useMemo(() => alerts.filter((a) => a.status === "CLOSED").length, [alerts]);

    const latencyAlerts = useMemo(() => alerts.filter((a) => a.inference_latency_ms > 0).slice(0, 50), [alerts]);
    const avgLatency = useMemo(() => latencyAlerts.length > 0
        ? Math.round(latencyAlerts.reduce((sum: number, a: Alert) => sum + a.inference_latency_ms, 0) / latencyAlerts.length)
        : 312, [latencyAlerts]);

    const today = useMemo(() => new Date().toDateString(), []);
    const resolvedToday = useMemo(() => alerts.filter(
        (a) => a.status === "CLOSED" && a.closed_at && new Date(a.closed_at).toDateString() === today
    ).length, [alerts, today]);

    const stats = useMemo(() => [
        {
            title: "Total Devices",
            value: devices.length.toLocaleString(),
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
            href: "/dashboard/alerts",
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
            title: "Anomalies Resolved",
            value: anomaliesResolved.toLocaleString(),
            delta: `${resolvedToday} today`,
            deltaPositive: true,
            icon: Shield,
            accent: "text-violet-500",
            accentBg: "bg-violet-500/10",
            accentBorder: "border-violet-500/20",
            href: null,
        },
    ], [devices, onlineCount, activeAlerts, pendingCount, avgLatency, anomaliesResolved, resolvedToday]);

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

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 shrink-0">
                    <Activity className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">
                        Live Monitoring
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                </div>
            </motion.div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07, duration: 0.4 }}
                        whileHover={{ y: -2, transition: { duration: 0.15 } }}
                        onClick={() => stat.href && (window.location.href = stat.href)}
                        className={`bg-card border border-border rounded-xl lg:rounded-2xl p-4 lg:p-5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-shadow relative overflow-hidden ${stat.href ? "cursor-pointer" : ""}`}
                    >
                        <div className="absolute top-0 right-0 w-12 h-12 rounded-bl-full opacity-10" style={{ background: "currentColor" }} />
                        <div className="flex items-start justify-between mb-3 lg:mb-4">
                            <div className={`w-8 lg:w-10 h-8 lg:h-10 rounded-xl border flex items-center justify-center ${stat.accentBg} ${stat.accentBorder}`}>
                                <stat.icon className={`h-4 lg:h-5 w-4 lg:w-5 ${stat.accent}`} />
                            </div>
                            <span className={`flex items-center gap-1 text-[10px] lg:text-xs font-medium px-2 py-0.5 rounded-full ${stat.deltaPositive ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"}`}>
                                {stat.deltaPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
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

            {/* Main content */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-5">
                <div className="xl:col-span-2 space-y-4 lg:space-y-5">
                    <AnomalyChart />
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