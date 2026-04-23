"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
    FileText,
    AlertTriangle,
    Brain,
    BarChart3,
    Search,
    Lock,
    ArrowRight,
    Shield,
    MonitorSmartphone,
    RefreshCw,
    Download,
    Clock,
    TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/useAuth";
import { useAlertStore } from "@/lib/stores/alert-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useCaseStore } from "@/lib/stores/case-store";
import { cn } from "@/lib/utils";
import type { Alert } from "@/lib/supabase/types";

interface ReportCard {
    id: string;
    title: string;
    description: string;
    icon: React.ElementType;
    color: string;
    bg: string;
    border: string;
    dotColor: string;
    href: string;
    roles: string[];
    category: "security" | "operations" | "intelligence" | "compliance";
    badge?: string;
    getStats?: (alerts: Alert[], devices: Device[], cases: Case[]) => { label: string; value: string; trend?: number }[];
}

interface Device {
    id: string;
    name: string;
    risk?: string;
    hash_chain_ok?: boolean;
    status?: string;
    cpu_percent?: number;
    ram_percent?: number;
}

interface Case {
    id: string;
    status: string;
}

type DateRange = "7d" | "30d" | "90d" | "all";

const categoryConfig = {
    security: { label: "Security", color: "text-destructive", bg: "bg-destructive/10" },
    operations: { label: "Operations", color: "text-primary", bg: "bg-primary/10" },
    intelligence: { label: "Intelligence", color: "text-violet-500", bg: "bg-violet-500/10" },
    compliance: { label: "Compliance", color: "text-amber-500", bg: "bg-amber-500/10" },
};

const reportCards: ReportCard[] = [
    {
        id: "alert-analysis",
        title: "Alert Analysis",
        description: "Deep-dive into security alerts by severity, category, device, and time range with exportable data.",
        icon: AlertTriangle,
        color: "text-destructive",
        bg: "bg-destructive/10",
        border: "border-destructive/20",
        dotColor: "bg-destructive",
        href: "/dashboard/reports/alert-analysis",
        roles: ["ADMINISTRATOR", "ANALYST"],
        category: "security",
        getStats: (alerts) => [
            { label: "Total alerts", value: alerts.length.toString() },
            { label: "Critical", value: alerts.filter(a => a.severity === "critical").length.toString() },
        ],
    },
    {
        id: "device-fleet",
        title: "Device Fleet Health",
        description: "Fleet-wide device health, risk distribution, performance metrics, and agent compliance.",
        icon: MonitorSmartphone,
        color: "text-primary",
        bg: "bg-primary/10",
        border: "border-primary/20",
        dotColor: "bg-primary",
        href: "/dashboard/reports/device-fleet",
        roles: ["ADMINISTRATOR", "ANALYST"],
        category: "operations",
        getStats: (_, devices) => [
            { label: "Devices", value: devices.length.toString() },
            { label: "At risk", value: devices.filter(d => d.risk === "critical" || d.risk === "high").length.toString() },
        ],
    },
    {
        id: "executive-summary",
        title: "Executive Summary",
        description: "High-level security posture overview with KPIs, trends, and executive-ready visualizations.",
        icon: BarChart3,
        color: "text-violet-500",
        bg: "bg-violet-500/10",
        border: "border-violet-500/20",
        dotColor: "bg-violet-500",
        href: "/dashboard/reports/executive-summary",
        roles: ["ADMINISTRATOR"],
        category: "security",
        badge: "Admin Only",
        getStats: (alerts) => [
            { label: "Total alerts", value: alerts.length.toString() },
            { label: "Resolved", value: alerts.filter(a => a.status === "CLOSED").length.toString() },
        ],
    },
    {
        id: "ml-performance",
        title: "ML Model Performance",
        description: "AI model accuracy, precision, recall, inference latency, and SHAP explainability metrics.",
        icon: Brain,
        color: "text-green-500",
        bg: "bg-green-500/10",
        border: "border-green-500/20",
        dotColor: "bg-green-500",
        href: "/dashboard/reports/ml-performance",
        roles: ["ADMINISTRATOR"],
        category: "intelligence",
        badge: "Admin Only",
        getStats: (alerts) => [
            { label: "Avg latency", value: alerts.length > 0 ? `${Math.round(alerts.reduce((s, a) => s + a.inference_latency_ms, 0) / alerts.length)}ms` : "—" },
            { label: "Detections", value: alerts.length.toString() },
        ],
    },
    {
        id: "integrity-audit",
        title: "Integrity Audit",
        description: "Hash chain verification status, tamper detection alerts, and tamper-evident log analysis.",
        icon: Shield,
        color: "text-sky-500",
        bg: "bg-sky-500/10",
        border: "border-sky-500/20",
        dotColor: "bg-sky-500",
        href: "/dashboard/reports/integrity-audit",
        roles: ["ADMINISTRATOR", "ANALYST"],
        category: "compliance",
        getStats: (_, devices) => [
            { label: "Devices", value: devices.length.toString() },
            { label: "Verified", value: devices.filter(d => d.hash_chain_ok !== false).length.toString() },
        ],
    },
];

export default function ReportsPage() {
    const { hasRole, loading, isAdmin } = useAuth();
    const { alerts, initialize: initAlerts } = useAlertStore();
    const { devices, initialize: initDevices } = useDeviceStore();
    const { cases, initialize: initCases } = useCaseStore();
    const initialized = useRef(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("All");
    const [dateRange, setDateRange] = useState<DateRange>("30d");
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

    useEffect(() => {
        if (!initialized.current) {
            initialized.current = true;
            initAlerts();
            initDevices();
            initCases();
        }
    }, [initAlerts, initDevices, initCases]);

    const categories = ["All", ...Array.from(new Set(reportCards.map(r => r.category)))];

    const cutoff = useMemo(() => {
        if (dateRange === "all") return new Date(0);
        const d = new Date();
        const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
        d.setDate(d.getDate() - days);
        return d;
    }, [dateRange]);

    const filteredAlerts = useMemo(() => alerts.filter(a => new Date(a.created_at) >= cutoff), [alerts, cutoff]);
    const filteredDevices = devices;
    const filteredCases = cases.filter(c => new Date(c.created_at) >= cutoff);

    const filteredReports = reportCards.filter(report => {
        const matchesSearch = report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            report.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === "All" || report.category === selectedCategory;
        const hasAccess = hasRole(report.roles);
        return matchesSearch && matchesCategory && hasAccess;
    });

    const byCategory = useMemo(() => {
        const groups: Record<string, ReportCard[]> = {};
        filteredReports.forEach(r => {
            if (!groups[r.category]) groups[r.category] = [];
            groups[r.category].push(r);
        });
        return groups;
    }, [filteredReports]);

    const globalStats = [
        { label: "Reports Available", value: filteredReports.length.toString(), color: "text-foreground", delta: null },
        { label: "Total Alerts", value: filteredAlerts.length.toString(), color: "text-destructive", delta: filteredAlerts.length > 0 ? "+" + filteredAlerts.length.toString() : "0" },
        { label: "Critical Alerts", value: filteredAlerts.filter(a => a.severity === "critical").length.toString(), color: "text-destructive", delta: null },
        { label: "Fleet Devices", value: devices.length.toString(), color: "text-primary", delta: null },
    ];

    const RANGE_OPTS: { label: string; value: DateRange }[] = [
        { label: "7 days", value: "7d" },
        { label: "30 days", value: "30d" },
        { label: "90 days", value: "90d" },
        { label: "All time", value: "all" },
    ];

    const handleRefresh = async () => {
        setRefreshing(true);
        await Promise.all([initAlerts(), initDevices(), initCases()]);
        setLastUpdated(new Date());
        setRefreshing(false);
    };

    const exportHubSummary = () => {
        const lines = [
            "EdgePulse Reports Hub Summary",
            `Generated: ${new Date().toISOString()}`,
            `Last Updated: ${lastUpdated.toISOString()}`,
            `Date Range: ${dateRange}`,
            "",
            "AVAILABLE REPORTS",
            ...filteredReports.map(r => `• ${r.title} (${r.category}) - ${r.roles.join(", ")}`),
            "",
            "CURRENT METRICS (Selected Period)",
            `Total Alerts: ${filteredAlerts.length}`,
            `Critical Alerts: ${filteredAlerts.filter(a => a.severity === "critical").length}`,
            `Pending Alerts: ${filteredAlerts.filter(a => a.status === "PENDING").length}`,
            `Devices Enrolled: ${devices.length}`,
            `Devices Online: ${devices.filter(d => d.status === "online").length}`,
            `Devices At Risk: ${devices.filter(d => d.risk === "critical" || d.risk === "high").length}`,
            `Open Cases: ${filteredCases.length}`,
        ];
        const blob = new Blob([lines.join("\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `reports-hub-summary-${dateRange}-${new Date().toISOString().split("T")[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    const hasAnyReportAccess = reportCards.some(report => hasRole(report.roles));

    if (!hasAnyReportAccess) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold">Access Denied</h3>
                    <p className="text-muted-foreground">You don&apos;t have permission to access reports.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1200px] space-y-6">
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">Reports & Analytics</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {isAdmin ? "Full access — all reports available" : "Analyst access — operational reports"}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                        {RANGE_OPTS.map(o => (
                            <button
                                key={o.value}
                                onClick={() => setDateRange(o.value)}
                                className={cn(
                                    "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                                    dateRange === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={handleRefresh} disabled={refreshing}>
                        {refreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Refresh
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={exportHubSummary}>
                        <Download className="h-3.5 w-3.5" />
                        Export
                    </Button>
                    <Badge variant="outline" className="gap-1.5 text-xs">
                        <span className={cn("w-1.5 h-1.5 rounded-full", isAdmin ? "bg-violet-500" : "bg-primary")} />
                        {isAdmin ? "Administrator" : "Analyst"}
                    </Badge>
                </div>
            </motion.div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {globalStats.map((s, i) => {
                    const bgMap: Record<string, string> = {
                        "text-foreground": "bg-card",
                        "text-destructive": "bg-destructive/5 border-destructive/15",
                        "text-primary": "bg-primary/5 border-primary/15",
                        "text-amber-500": "bg-amber-500/5 border-amber-500/15",
                        "text-violet-500": "bg-violet-500/5 border-violet-500/15",
                    };
                    const borderMap: Record<string, string> = {
                        "text-foreground": "border-border",
                        "text-destructive": "border-destructive/20",
                        "text-primary": "border-primary/20",
                        "text-amber-500": "border-amber-500/20",
                        "text-violet-500": "border-violet-500/20",
                    };
                    return (
                        <motion.div
                            key={s.label}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.06 }}
                            className={cn("border rounded-xl p-4 relative overflow-hidden", bgMap[s.color] || "bg-card", borderMap[s.color] || "border-border")}
                        >
                            <div className={cn("absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-10", s.color.replace("text-", "bg-"))} />
                            <div className="flex items-start justify-between relative">
                                <p className={`text-2xl font-bold font-display ${s.color}`}>{s.value}</p>
                                {s.delta && (
                                    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
                                        s.delta !== "0" ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground")}>
                                        {s.delta !== "0" && <TrendingUp className="h-3 w-3" />}
                                        {s.delta}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 relative">{s.label}</p>
                        </motion.div>
                    );
                })}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.24 }}
                    className="bg-card border border-border rounded-xl p-4 flex items-center justify-between"
                >
                    <div>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last updated
                        </p>
                        <p className="text-xs font-medium text-foreground mt-0.5">
                            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </motion.div>
            </div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filter Reports</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search reports..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {categories.map((category) => {
                            const isAll = category === "All";
                            const cfg = isAll ? null : categoryConfig[category as keyof typeof categoryConfig];
                            return (
                                <Button
                                    key={category}
                                    variant={selectedCategory === category ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setSelectedCategory(category)}
                                    className={cn(
                                        selectedCategory === category && cfg && cfg.bg.replace("/10", "")
                                    )}
                                >
                                    {isAll ? "All" : cfg?.label || category}
                                </Button>
                            );
                        })}
                    </div>
                </div>
            </motion.div>

            {Object.entries(byCategory).map(([cat, cards], ci) => {
                const cfg = categoryConfig[cat as keyof typeof categoryConfig];
                return (
                    <motion.div
                        key={cat}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + ci * 0.08 }}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <span className={cn("text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full", cfg.bg, cfg.color)}>
                                {cfg.label}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {cards.map((card, i) => (
                                <Link key={card.id} href={card.href}>
                                    <motion.div
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.25 + i * 0.07 }}
                                        whileHover={{ y: -4, transition: { duration: 0.2 } }}
                                        className={cn(
                                            "group bg-card border rounded-2xl p-5 hover:shadow-lg hover:shadow-black/5 transition-all cursor-pointer relative overflow-hidden",
                                            card.border
                                        )}
                                    >
                                        <div className={cn("absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-5", card.bg)} />
                                        <div className="flex items-start justify-between mb-4 relative">
                                            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm", card.bg, card.border)}>
                                                <card.icon className={cn("h-6 w-6", card.color)} />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {!hasRole(["ADMINISTRATOR"]) && card.roles.length === 1 && card.roles[0] === "ADMINISTRATOR" && (
                                                    <Lock className="h-3.5 w-3.5 text-muted-foreground/40" />
                                                )}
                                                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        </div>

                                        <h3 className="text-base font-semibold text-foreground mb-2 relative">{card.title}</h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed mb-4 relative">{card.description}</p>

                                        {card.getStats && (
                                            <div className="flex items-center gap-6 pt-3 border-t border-border/50 mb-3 relative">
                                                {card.getStats(filteredAlerts, filteredDevices, filteredCases).slice(0, 2).map((stat, idx) => (
                                                    <div key={idx}>
                                                        <p className={cn("text-lg font-bold font-display", card.color)}>{stat.value}</p>
                                                        <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-1.5 mt-3 relative">
                                            {card.roles.map(role => (
                                                <span key={role} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                                                    {role === "ADMINISTRATOR" ? "Admin" : "Analyst"}
                                                </span>
                                            ))}
                                        </div>
                                    </motion.div>
                                </Link>
                            ))}
                        </div>
                    </motion.div>
                );
            })}

            {filteredReports.length === 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-12"
                >
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No reports found</h3>
                    <p className="text-muted-foreground">Try adjusting your search or category filter</p>
                </motion.div>
            )}

            {!isAdmin && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="bg-muted/30 border border-border rounded-xl p-4 flex items-center gap-3"
                >
                    <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-foreground">Some reports are restricted to administrators</p>
                        <p className="text-xs text-muted-foreground">Executive Summary and ML Performance reports require administrator access.</p>
                    </div>
                </motion.div>
            )}
        </div>
    );
}