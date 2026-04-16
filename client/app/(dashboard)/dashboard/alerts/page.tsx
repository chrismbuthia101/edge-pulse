"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ChevronRight,
    Clock,
    MonitorSmartphone,
    CheckCircle2,
    X,
    Eye,
    Search,
    SlidersHorizontal,
    Download,
    Brain,
    Cpu,
    Zap,
    Network,
    Activity,
    Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAlertStore } from "@/stores/alert-store";
import { useAuth } from "@/lib/auth/useAuth";
import type { AlertStatus } from "@/lib/supabase/types";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";

const severityConfig = {
    critical: {
        label: "Critical",
        color: "text-destructive",
        bg: "bg-destructive/10",
        border: "border-destructive/20",
        dot: "bg-destructive",
    },
    high: {
        label: "High",
        color: "text-orange-500",
        bg: "bg-orange-500/10",
        border: "border-orange-500/20",
        dot: "bg-orange-500",
    },
    medium: {
        label: "Medium",
        color: "text-amber-500",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
        dot: "bg-amber-500",
    },
    low: {
        label: "Low",
        color: "text-primary",
        bg: "bg-primary/10",
        border: "border-primary/20",
        dot: "bg-primary",
    },
};

const confidenceBadgeClass = (score: number) => {
    if (score >= 0.9) return "text-destructive bg-destructive/10 border-destructive/25";
    if (score >= 0.7) return "text-orange-500 bg-orange-500/10 border-orange-500/25";
    return "text-amber-500 bg-amber-500/10 border-amber-500/25";
};

const telemetrySourceIcon = (source?: string) => {
    switch (source) {
        case "PROCESS": return <Activity className="h-3 w-3" />;
        case "NETWORK": return <Network className="h-3 w-3" />;
        case "FILE": return <Shield className="h-3 w-3" />;
        case "RESOURCE": return <Cpu className="h-3 w-3" />;
        default: return <Zap className="h-3 w-3" />;
    }
};

const nextStatus: Record<AlertStatus, AlertStatus | null> = {
    PENDING: "ACKNOWLEDGED",
    ACKNOWLEDGED: "INVESTIGATED",
    INVESTIGATED: "CLOSED",
    CLOSED: null,
};

type StatusFilter = "ALL" | "PENDING" | "IN_REVIEW" | "CLOSED";
type SeverityFilter = "ALL" | "critical" | "high" | "medium" | "low";

// Alert Rules modal content
function AlertRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const rules = [
        { name: "Critical Process Injection", condition: "anomaly_score > 0.95 AND source = PROCESS", action: "Auto-block + Alert", active: true },
        { name: "Outbound Data Exfiltration", condition: "network_bytes_out > 100MB in 5min", action: "Alert + Quarantine", active: true },
        { name: "Brute Force Detection", condition: "auth_failures > 50 in 60s", action: "Block IP + Alert", active: true },
        { name: "Off-Hours Login", condition: "login_hour NOT IN (8-18) AND is_admin = true", action: "Alert only", active: false },
    ];

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Alert Rules</DialogTitle>
                    <DialogDescription>
                        Detection rules that automatically trigger alerts when conditions are met.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                    {rules.map((rule, i) => (
                        <div key={i} className="p-3 rounded-xl border border-border bg-muted/30 space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-foreground">{rule.name}</span>
                                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border",
                                    rule.active
                                        ? "bg-green-500/10 text-green-600 border-green-500/20"
                                        : "bg-muted text-muted-foreground border-border"
                                )}>
                                    {rule.active ? "Active" : "Disabled"}
                                </span>
                            </div>
                            <p className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                                {rule.condition}
                            </p>
                            <p className="text-xs text-muted-foreground">Action: <span className="text-foreground">{rule.action}</span></p>
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button onClick={onClose}>+ New Rule</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function AlertsPage() {
    useEffect(() => {
        document.title = "Security Alerts - EdgePulse";
    }, []);

    const { user, isAdmin } = useAuth();
    const { alerts, bulkAcknowledge } = useAlertStore();
    const initializedRef = useRef(false);
    const lastUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!user) return;
        if (alerts.length > 0 && lastUserIdRef.current === user.id && initializedRef.current) return;
        
        initializedRef.current = true;
        lastUserIdRef.current = user.id;
        const { refreshAlertsForUser } = useAlertStore.getState();
        refreshAlertsForUser(user.id, isAdmin);
    }, [user, isAdmin, alerts.length]);

    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
    const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [rulesOpen, setRulesOpen] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);

    const filtered = useMemo(() => {
        return alerts.filter((a) => {
            const matchesStatus =
                statusFilter === "ALL" ||
                (statusFilter === "PENDING" && a.status === "PENDING") ||
                (statusFilter === "IN_REVIEW" && (a.status === "ACKNOWLEDGED" || a.status === "INVESTIGATED")) ||
                (statusFilter === "CLOSED" && a.status === "CLOSED");
            const matchesSeverity = severityFilter === "ALL" || a.severity === severityFilter;
            const matchesSearch =
                a.title.toLowerCase().includes(search.toLowerCase()) ||
                a.device_name?.toLowerCase().includes(search.toLowerCase());
            return matchesStatus && matchesSeverity && matchesSearch;
        });
    }, [alerts, statusFilter, severityFilter, search]);

    const counts = useMemo(() => ({
        PENDING: alerts.filter((a) => a.status === "PENDING").length,
        IN_REVIEW: alerts.filter((a) => a.status === "ACKNOWLEDGED" || a.status === "INVESTIGATED").length,
        CLOSED: alerts.filter((a) => a.status === "CLOSED").length,
        critical: alerts.filter((a) => a.severity === "critical" && a.status !== "CLOSED").length,
    }), [alerts]);

    // Resolve alert to next status
    const handleResolve = async (e: React.MouseEvent, alertId: string, currentStatus: AlertStatus) => {
        e.stopPropagation();
        const next = nextStatus[currentStatus];
        if (!next) return;

        try {
            const { updateAlertStatus } = useAlertStore.getState();
            await updateAlertStatus(alertId, next);
        } catch {
            toast.error("Failed to update alert");
        }
    };

    // Dismiss alert
    const handleDismiss = async (e: React.MouseEvent, alertId: string) => {
        e.stopPropagation();
        try {
            const { updateAlertStatus } = useAlertStore.getState();
            await updateAlertStatus(alertId, "CLOSED");
        } catch {
            toast.error("Failed to dismiss alert");
        }
    };

    // Bulk mark all reviewed
    const handleMarkAllReviewed = async () => {
        const pending = alerts.filter((a) => a.status === "PENDING");
        if (pending.length === 0) { toast.info("No pending alerts to review"); return; }

        setBulkLoading(true);
        try {
            const pendingIds = pending.map(a => a.id);
            await bulkAcknowledge(pendingIds);
            toast.success(`Acknowledged ${pendingIds.length} alerts`);
        } catch {
            toast.error("Failed to mark alerts as reviewed");
        } finally {
            setBulkLoading(false);
        }
    };

    // CSV export
    const handleExportCSV = () => {
        const rows = [
            ["ID", "Title", "Device", "Severity", "Status", "Anomaly Score", "Category", "Source", "Created At"],
            ...filtered.map((a) => [
                a.id,
                `"${a.title}"`,
                a.device_name ?? "",
                a.severity,
                a.status,
                ((a.anomaly_score ?? a.confidence ?? 0) * 100).toFixed(1) + "%",
                a.category ?? "",
                a.telemetry_source ?? "",
                new Date(a.created_at).toISOString(),
            ]),
        ];
        const csv = rows.map((r) => r.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `edgepulse-alerts-${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Exported alerts as CSV");
    };

    const relativeTime = (iso: string) => {
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return "just now";
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    };

    return (
        <div className="max-w-[1200px] space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start justify-between"
            >
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">Alerts</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Manage and investigate security alerts
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {isAdmin && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => setRulesOpen(true)}
                        >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            Alert Rules
                        </Button>
                    )}
                    <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={handleMarkAllReviewed}
                        disabled={bulkLoading || counts.PENDING === 0}
                    >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {bulkLoading ? "Updating..." : "Mark All Reviewed"}
                    </Button>
                </div>
            </motion.div>

            {/* Alert Rules Modal */}
            <AlertRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "Pending", value: counts.PENDING, color: "text-destructive", bg: "bg-destructive/10" },
                    { label: "In Review", value: counts.IN_REVIEW, color: "text-amber-500", bg: "bg-amber-500/10" },
                    { label: "Closed", value: counts.CLOSED, color: "text-green-500", bg: "bg-green-500/10" },
                    { label: "Critical Open", value: counts.critical, color: "text-destructive", bg: "bg-destructive/10" },
                ].map((s) => (
                    <div key={s.label} className={`${s.bg} rounded-xl border border-border p-4`}>
                        <p className={`text-2xl font-bold font-display ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="Search alerts..."
                        className="pl-9 h-9 text-sm"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                        {(["ALL", "PENDING", "IN_REVIEW", "CLOSED"] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setStatusFilter(f)}
                                aria-pressed={statusFilter === f}
                                className={cn(
                                    "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                                    statusFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {f === "IN_REVIEW" ? "Review" : f.charAt(0) + f.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                        {(["ALL", "critical", "high", "medium", "low"] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setSeverityFilter(f)}
                                aria-pressed={severityFilter === f}
                                className={cn(
                                    "px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all",
                                    severityFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Alerts list */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="divide-y divide-border">
                    <AnimatePresence mode="popLayout">
                        {filtered.map((alert, i) => {
                            const sev = severityConfig[alert.severity] ?? severityConfig.medium;
                            const isSelected = selectedId === alert.id;
                            const score = alert.anomaly_score ?? alert.confidence ?? 0;

                            return (
                                <motion.div
                                    key={alert.id}
                                    layout
                                    initial={{ opacity: 0, x: -16 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 16 }}
                                    transition={{ delay: i * 0.03, duration: 0.2 }}
                                    className={cn(
                                        "group px-5 py-4 hover:bg-muted/30 cursor-pointer transition-colors",
                                        isSelected && "bg-muted/50"
                                    )}
                                    onClick={() => setSelectedId(isSelected ? null : alert.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn("w-2 h-2 rounded-full shrink-0", sev.dot)} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className="text-sm font-medium text-foreground truncate">
                                                    {alert.title}
                                                </span>
                                                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", sev.bg, sev.color, sev.border)}>
                                                    {sev.label}
                                                </span>
                                                {/* Anomaly score badge */}
                                                <span className={cn("text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full border", confidenceBadgeClass(score))}>
                                                    {(score * 100).toFixed(0)}%
                                                </span>
                                                {alert.category && (
                                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                        {alert.category}
                                                    </span>
                                                )}
                                                {/* Telemetry source label */}
                                                {alert.telemetry_source && (
                                                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/70 px-1.5 py-0.5 rounded">
                                                        {telemetrySourceIcon(alert.telemetry_source)}
                                                        {alert.telemetry_source}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                                <span className="flex items-center gap-1">
                                                    <MonitorSmartphone className="h-3 w-3" />
                                                    {alert.device_name}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {relativeTime(alert.created_at)}
                                                </span>
                                                <span className="text-muted-foreground/70">
                                                    {alert.status.replace(/_/g, " ")}
                                                </span>
                                                {alert.inference_latency_ms > 0 && (
                                                    <span className="flex items-center gap-1">
                                                        <Zap className="h-3 w-3" />
                                                        {alert.inference_latency_ms}ms
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                            <button
                                                aria-label="Advance alert status"
                                                className="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center hover:bg-green-500/20"
                                                onClick={(e) => handleResolve(e, alert.id, alert.status)}
                                            >
                                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                            </button>
                                            <button
                                                aria-label="Dismiss alert"
                                                className="w-7 h-7 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center hover:bg-destructive/20"
                                                onClick={(e) => handleDismiss(e, alert.id)}
                                            >
                                                <X className="h-3.5 w-3.5 text-destructive" />
                                            </button>
                                        </div>
                                        <ChevronRight
                                            className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", isSelected && "rotate-90")}
                                        />
                                    </div>

                                    {/* Expanded detail */}
                                    <AnimatePresence>
                                        {isSelected && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="mt-4 pt-4 border-t border-border space-y-4">
                                                    {alert.description && (
                                                        <p className="text-sm text-muted-foreground">{alert.description}</p>
                                                    )}
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                                        {/* Status lifecycle */}
                                                        <div>
                                                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Status</p>
                                                            <p className="text-xs font-medium text-foreground">{alert.status.replace(/_/g, " ")}</p>
                                                        </div>
                                                        {/* Anomaly score bar */}
                                                        <div>
                                                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Anomaly Score</p>
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="flex-1 h-1 bg-muted rounded-full">
                                                                    <div className="h-full bg-primary rounded-full" style={{ width: `${score * 100}%` }} />
                                                                </div>
                                                                <span className="text-xs font-mono font-bold text-primary">{(score * 100).toFixed(0)}%</span>
                                                            </div>
                                                        </div>
                                                        {/* Model ID */}
                                                        {alert.model_id && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                                                                    <Brain className="h-2.5 w-2.5" /> Model
                                                                </p>
                                                                <p className="text-xs font-mono text-foreground">{alert.model_id}</p>
                                                            </div>
                                                        )}
                                                        {/* Agent version */}
                                                        {alert.collection_agent_version && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                                                                    <Cpu className="h-2.5 w-2.5" /> Agent
                                                                </p>
                                                                <p className="text-xs font-mono text-foreground">{alert.collection_agent_version}</p>
                                                            </div>
                                                        )}
                                                        {/* Detection latency */}
                                                        {alert.inference_latency_ms > 0 && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Latency</p>
                                                                <p className="text-xs font-mono text-foreground">{alert.inference_latency_ms}ms</p>
                                                            </div>
                                                        )}
                                                        {/* Telemetry source */}
                                                        {alert.telemetry_source && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Source</p>
                                                                <span className="flex items-center gap-1 text-xs text-foreground">
                                                                    {telemetrySourceIcon(alert.telemetry_source)}
                                                                    {alert.telemetry_source}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {/* Detection window */}
                                                        <div>
                                                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Detection Window</p>
                                                            <p className="text-xs text-foreground">
                                                                {new Date(alert.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                            </p>
                                                        </div>
                                                        {/* Network details for NETWORK alerts */}
                                                        {alert.telemetry_source === "NETWORK" && (
                                                            <>
                                                                {alert.net_destination_ip && (
                                                                    <div>
                                                                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Dest. IP</p>
                                                                        <p className="text-xs font-mono text-foreground">{alert.net_destination_ip}</p>
                                                                    </div>
                                                                )}
                                                                {alert.net_protocol && (
                                                                    <div>
                                                                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Protocol</p>
                                                                        <p className="text-xs font-mono text-foreground">{alert.net_protocol}</p>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                        {/* Process details for PROCESS alerts */}
                                                        {alert.telemetry_source === "PROCESS" && alert.proc_privilege_level && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Privilege</p>
                                                                <p className="text-xs font-mono text-foreground capitalize">{alert.proc_privilege_level}</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Lifecycle timestamps */}
                                                    <div className="flex flex-wrap gap-3 pt-1">
                                                        {alert.acknowledged_at && (
                                                            <span className="text-[10px] text-muted-foreground">
                                                                Acknowledged: {new Date(alert.acknowledged_at).toLocaleString()}
                                                            </span>
                                                        )}
                                                        {alert.investigated_at && (
                                                            <span className="text-[10px] text-muted-foreground">
                                                                Investigated: {new Date(alert.investigated_at).toLocaleString()}
                                                            </span>
                                                        )}
                                                        {alert.closed_at && (
                                                            <span className="text-[10px] text-muted-foreground">
                                                                Closed: {new Date(alert.closed_at).toLocaleString()}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex gap-2 pt-1">
                                                        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
                                                            <Eye className="h-3 w-3" />
                                                            Full Analysis
                                                        </Button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                    {filtered.length === 0 && (
                        <div className="py-16 text-center">
                            <Shield className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground font-medium">No alerts match your filters</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">Try adjusting the status or severity filter</p>
                        </div>
                    )}
                </div>
                <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                        Showing {filtered.length} of {alerts.length} alerts
                    </p>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={handleExportCSV}>
                        <Download className="h-3 w-3" />
                        Export CSV
                    </Button>
                </div>
            </div>
        </div>
    );
}