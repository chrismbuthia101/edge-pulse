"use client";

import { motion } from "framer-motion";
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
    },
];

const incidentSummary = [
    { label: "Critical", value: 3, color: "text-destructive", bg: "bg-destructive/10", icon: AlertTriangle },
    { label: "Resolved Today", value: 77, color: "text-green-500", bg: "bg-green-500/10", icon: CheckCircle2 },
    { label: "Avg Resolve", value: "4.2m", color: "text-primary", bg: "bg-primary/10", icon: Clock },
    { label: "Detection Rate", value: "99.9%", color: "text-violet-500", bg: "bg-violet-500/10", icon: TrendingUp },
];

export default function DashboardPage() {
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

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07, duration: 0.4 }}
                        whileHover={{ y: -2, transition: { duration: 0.15 } }}
                        className="bg-card border border-border rounded-xl lg:rounded-2xl p-4 lg:p-5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-shadow"
                    >
                        <div className="flex items-start justify-between mb-3 lg:mb-4">
                            <div className={`w-8 lg:w-10 h-8 lg:h-10 rounded-xl border flex items-center justify-center ${stat.accentBg} ${stat.accentBorder}`}>
                                <stat.icon className={`h-4 lg:h-5 w-4 lg:w-5 ${stat.accent}`} />
                            </div>
                            <span className={`flex items-center gap-1 text-[10px] lg:text-xs font-medium px-2 py-0.5 rounded-full ${stat.deltaPositive ? "text-green-600 dark:text-green-400 bg-green-500/10" : "text-destructive bg-destructive/10"}`}>
                                {stat.deltaPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                <span className="hidden sm:inline">{stat.delta}</span>
                                <span className="sm:hidden">{stat.delta.split(' ')[0]}</span>
                            </span>
                        </div>
                        <p className="text-lg lg:text-2xl font-bold font-display text-foreground mb-0.5">{stat.value}</p>
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
                    <div key={item.label} className={`flex items-center gap-2 lg:gap-3 p-3 lg:p-3.5 rounded-xl border border-border ${item.bg}`}>
                        <item.icon className={`h-3.5 lg:h-4 w-3.5 lg:w-4 shrink-0 ${item.color}`} />
                        <div className="min-w-0">
                            <p className={`text-sm lg:text-lg font-bold font-display ${item.color} truncate`}>{item.value}</p>
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