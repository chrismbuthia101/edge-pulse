"use client";

import { motion } from "framer-motion";
import {
    ShieldAlert,
    MonitorSmartphone,
    Zap,
    TrendingUp,
    Shield,
    Clock,
    AlertTriangle,
    CheckCircle2,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { AlertFeed } from "@/components/dashboard/alert-feed";
import { DeviceList } from "@/components/dashboard/device-list";
import { ShapPanel } from "@/components/dashboard/shap-panel";
import { LiveFeed } from "@/components/dashboard/live-feed";
import { ThreatChart } from "@/components/dashboard/threat-chart";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { SystemHealth } from "@/components/dashboard/system-health";

const stats = [
    {
        title: "Total Devices",
        value: "1,247",
        delta: "+3 today",
        deltaPositive: true,
        icon: MonitorSmartphone,
        accent: "text-primary",
        accentBg: "bg-primary/10",
        accentBorder: "border-primary/20",
        chart: [40, 55, 50, 60, 65, 70, 75, 80, 72, 85, 90, 88],
    },
    {
        title: "Active Alerts",
        value: "89",
        delta: "+23% vs yesterday",
        deltaPositive: false,
        icon: ShieldAlert,
        accent: "text-destructive",
        accentBg: "bg-destructive/10",
        accentBorder: "border-destructive/20",
        chart: [20, 35, 28, 45, 55, 60, 58, 70, 65, 80, 78, 89],
    },
    {
        title: "Mean Response",
        value: "312ms",
        delta: "↓18% faster",
        deltaPositive: true,
        icon: Zap,
        accent: "text-green-500",
        accentBg: "bg-green-500/10",
        accentBorder: "border-green-500/20",
        chart: [800, 750, 700, 650, 600, 550, 500, 450, 420, 380, 340, 312],
    },
    {
        title: "Threats Blocked",
        value: "2,341",
        delta: "+156 this week",
        deltaPositive: true,
        icon: Shield,
        accent: "text-violet-500",
        accentBg: "bg-violet-500/10",
        accentBorder: "border-violet-500/20",
        chart: [120, 145, 160, 180, 200, 215, 225, 240, 260, 280, 310, 341],
    },
];

const criticalMetrics = [
    { label: "Critical Alerts", value: "3", icon: AlertTriangle, color: "text-destructive" },
    { label: "Incidents Today", value: "12", icon: ShieldAlert, color: "text-orange-500" },
    { label: "Resolved", value: "77", icon: CheckCircle2, color: "text-green-500" },
    { label: "Avg Resolve Time", value: "4.2m", icon: Clock, color: "text-primary" },
    { label: "Detection Rate", value: "99.9%", icon: TrendingUp, color: "text-violet-500" },
];

export default function DashboardPage() {
    return (
        <div className="space-y-6 max-w-[1600px]">
            {/* Page header */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-start justify-between"
            >
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">
                        Security Overview
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </p>
                </div>

                {/* Critical metrics strip */}
                <div className="hidden xl:flex items-center gap-1 bg-card border border-border rounded-2xl px-4 py-2.5 divide-x divide-border">
                    {criticalMetrics.map((m) => (
                        <div key={m.label} className="flex items-center gap-2 px-3 first:pl-0 last:pr-0">
                            <m.icon className={`h-3.5 w-3.5 ${m.color}`} />
                            <div>
                                <p className={`text-sm font-bold font-display ${m.color}`}>{m.value}</p>
                                <p className="text-[10px] text-muted-foreground leading-none">{m.label}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Stat cards row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                    <StatCard key={stat.title} {...stat} index={i} />
                ))}
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                {/* Left column - 2/3 width */}
                <div className="xl:col-span-2 space-y-5">
                    <ThreatChart />
                    <AlertFeed />
                </div>

                {/* Right column - 1/3 width */}
                <div className="space-y-5">
                    <QuickActions />
                    <ShapPanel />
                </div>
            </div>

            {/* Bottom grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className="xl:col-span-2">
                    <DeviceList />
                </div>
                <div className="space-y-5">
                    <LiveFeed />
                    <SystemHealth />
                </div>
            </div>
        </div>
    );
}