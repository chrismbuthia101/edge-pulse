"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertTriangle,
    ChevronRight,
    Clock,
    MonitorSmartphone,
    CheckCircle2,
    X,
    Eye,
    Brain,
    Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAlertStore } from "@/stores/alert-store";
import { createClient } from "@/lib/supabase/client";
import type { AlertStatus } from "@/lib/supabase/types";
import { toast } from "sonner";
import Link from "next/link";

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

// Status lifecycle: PENDING → ACKNOWLEDGED → INVESTIGATED → CLOSED
const nextStatus: Record<AlertStatus, AlertStatus | null> = {
    PENDING: "ACKNOWLEDGED",
    ACKNOWLEDGED: "INVESTIGATED",
    INVESTIGATED: "CLOSED",
    CLOSED: null,
};

const confidenceBadgeClass = (score: number) => {
    if (score >= 0.9) return "text-destructive bg-destructive/10 border-destructive/25";
    if (score >= 0.7) return "text-orange-500 bg-orange-500/10 border-orange-500/25";
    return "text-amber-500 bg-amber-500/10 border-amber-500/25";
};

export function AlertFeed() {
    const [filter, setFilter] = useState<"ALL" | "PENDING" | "IN_REVIEW" | "CLOSED">("ALL");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(() => Date.now());

    // Update current time every minute to keep relative times fresh
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(Date.now());
        }, 60000); // Update every minute

        return () => clearInterval(interval);
    }, []);

    const alerts = useAlertStore((s) => s.alerts);
    const updateAlert = useAlertStore((s) => s.updateAlert);
    const supabase = createClient();

    // Map store status to filter values
    const filtered = alerts.filter((a) => {
        if (filter === "ALL") return a.status !== "CLOSED";
        if (filter === "PENDING") return a.status === "PENDING";
        if (filter === "IN_REVIEW") return a.status === "ACKNOWLEDGED" || a.status === "INVESTIGATED";
        if (filter === "CLOSED") return a.status === "CLOSED";
        return true;
    });

    const pendingCount = alerts.filter((a) => a.status === "PENDING").length;

    // Resolve alert
    const handleResolve = async (e: React.MouseEvent, alertId: string, currentStatus: AlertStatus) => {
        e.stopPropagation();
        const next = nextStatus[currentStatus];
        if (!next) return;

        const now = new Date().toISOString();
        const updates: Record<string, string> = { status: next };
        if (next === "ACKNOWLEDGED") updates.acknowledged_at = now;
        if (next === "INVESTIGATED") updates.investigated_at = now;
        if (next === "CLOSED") updates.closed_at = now;

        updateAlert(alertId, updates as never);

        const { error } = await supabase
            .from("alert_records")
            .update(updates)
            .eq("id", alertId);

        if (error) {
            toast.error("Failed to update alert");
            // revert optimistic update
            updateAlert(alertId, { status: currentStatus });
        }
    };

    // Dismiss alert
    const handleDismiss = async (e: React.MouseEvent, alertId: string) => {
        e.stopPropagation();
        const now = new Date().toISOString();
        updateAlert(alertId, { status: "CLOSED", closed_at: now } as never);

        const { error } = await supabase
            .from("alert_records")
            .update({ status: "CLOSED", closed_at: now })
            .eq("id", alertId);

        if (error) {
            toast.error("Failed to dismiss alert");
            updateAlert(alertId, { status: "PENDING" } as never);
        }
    };

    // Format relative time
    const relativeTime = (iso: string) => {
        const diff = currentTime - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return "just now";
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    };

    return (
        <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-foreground truncate">Active Alerts</h3>
                    {pendingCount > 0 && (
                        <span
                            className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30 shrink-0"
                            aria-label={`${pendingCount} pending alerts`}
                        >
                            {pendingCount}
                        </span>
                    )}
                </div>

                {/* Filter tabs */}
                <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5 min-w-0 overflow-x-auto" role="tablist" aria-label="Alert filters">
                    {(["ALL", "PENDING", "IN_REVIEW", "CLOSED"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                                "px-2 lg:px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                                filter === f
                                    ? "bg-card text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                            role="tab"
                            aria-selected={filter === f}
                            aria-controls="alert-list"
                        >
                            {f === "IN_REVIEW" ? "Review" : f.charAt(0) + f.slice(1).toLowerCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* Alert list */}
            <div
                className="divide-y divide-border max-h-[350px] lg:max-h-[420px] overflow-y-auto"
                id="alert-list"
                role="tabpanel"
                aria-label={`Filtered alerts: ${filter.toLowerCase()}`}
            >
                <AnimatePresence mode="popLayout">
                    {filtered.map((alert, i) => {
                        const sev = severityConfig[alert.severity] ?? severityConfig.medium;
                        const isSelected = selectedId === alert.id;

                        return (
                            <motion.div
                                key={alert.id}
                                layout
                                initial={{ opacity: 0, x: -16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 16 }}
                                transition={{ delay: i * 0.04, duration: 0.25 }}
                                className={cn(
                                    "group px-4 lg:px-5 py-3 lg:py-3.5 hover:bg-muted/30 cursor-pointer transition-colors",
                                    isSelected && "bg-muted/50"
                                )}
                                onClick={() => setSelectedId(isSelected ? null : alert.id)}
                            >
                                <div className="flex items-start gap-2 lg:gap-3">
                                    <div className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5", sev.dot)} />

                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 mb-1 gap-1">
                                            <span className="text-sm font-medium text-foreground truncate">
                                                {alert.title}
                                            </span>
                                            <span
                                                className={cn(
                                                    "text-[10px] font-bold px-1.5 py-0.5 rounded border w-fit shrink-0",
                                                    sev.bg,
                                                    sev.color,
                                                    sev.border
                                                )}
                                            >
                                                {sev.label}
                                            </span>
                                            {/* ── Anomaly score badge (Stage 1 item 29) ── */}
                                            <span
                                                className={cn(
                                                    "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full border w-fit shrink-0",
                                                    confidenceBadgeClass(alert.anomaly_score ?? alert.confidence)
                                                )}
                                            >
                                                {((alert.anomaly_score ?? alert.confidence) * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <MonitorSmartphone className="h-3 w-3 shrink-0" />
                                                <span className="truncate">{alert.device_name}</span>
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3 shrink-0" />
                                                {relativeTime(alert.created_at)}
                                            </span>
                                            <span className="text-muted-foreground/70 hidden sm:inline">
                                                {alert.status.replace("_", " ")}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <button
                                            aria-label="Resolve alert"
                                            className="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center hover:bg-green-500/20 transition-colors"
                                            onClick={(e) => handleResolve(e, alert.id, alert.status)}
                                        >
                                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                        </button>
                                        <button
                                            aria-label="Dismiss alert"
                                            className="w-7 h-7 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center hover:bg-destructive/20 transition-colors"
                                            onClick={(e) => handleDismiss(e, alert.id)}
                                        >
                                            <X className="h-3.5 w-3.5 text-destructive" />
                                        </button>
                                    </div>
                                    <ChevronRight
                                        className={cn(
                                            "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 mt-0.5",
                                            isSelected && "rotate-90"
                                        )}
                                    />
                                </div>

                                {/* Expanded detail — shows anomaly_score, model_id, agent version, lifecycle */}
                                <AnimatePresence>
                                    {isSelected && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                                                        Category
                                                    </p>
                                                    <p className="text-xs font-medium text-foreground">{alert.category}</p>
                                                </div>
                                                {/* ── Full lifecycle status (Stage 1 item 30) ── */}
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                                                        Status
                                                    </p>
                                                    <p className="text-xs font-medium text-foreground">
                                                        {alert.status.replace(/_/g, " ")}
                                                    </p>
                                                </div>
                                                {/* ── Anomaly score bar ── */}
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                                                        Anomaly Score
                                                    </p>
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="flex-1 h-1 bg-muted rounded-full">
                                                            <div
                                                                className="h-full bg-primary rounded-full"
                                                                style={{
                                                                    width: `${(alert.anomaly_score ?? alert.confidence) * 100}%`,
                                                                }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-mono font-bold text-primary">
                                                            {((alert.anomaly_score ?? alert.confidence) * 100).toFixed(0)}%
                                                        </span>
                                                    </div>
                                                </div>
                                                {/* ── Model ID (Stage 1 item 31) ── */}
                                                {alert.model_id && (
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                                                            <Brain className="h-2.5 w-2.5" /> Model
                                                        </p>
                                                        <p className="text-xs font-mono text-foreground">{alert.model_id}</p>
                                                    </div>
                                                )}
                                                {/* ── Agent version (Stage 1 item 31) ── */}
                                                {alert.collection_agent_version && (
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                                                            <Cpu className="h-2.5 w-2.5" /> Agent
                                                        </p>
                                                        <p className="text-xs font-mono text-foreground">
                                                            {alert.collection_agent_version}
                                                        </p>
                                                    </div>
                                                )}
                                                {/* ── Inference latency ── */}
                                                {alert.inference_latency_ms > 0 && (
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                                                            Latency
                                                        </p>
                                                        <p className="text-xs font-mono text-foreground">
                                                            {alert.inference_latency_ms}ms
                                                        </p>
                                                    </div>
                                                )}
                                                <div className="col-span-2 sm:col-span-3 pt-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="gap-1.5 h-7 text-xs w-full sm:w-auto"
                                                        asChild
                                                    >
                                                        <Link href={`/dashboard/alerts`}>
                                                            <Eye className="h-3 w-3" />
                                                            View Full Analysis
                                                        </Link>
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
                        <AlertTriangle className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">No alerts in this view</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 lg:px-5 py-3 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    Showing {filtered.length} of {alerts.length} alerts
                </p>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 w-full sm:w-auto justify-center" asChild>
                    <Link href="/dashboard/alerts">
                        View All Alerts
                        <ChevronRight className="h-3 w-3" />
                    </Link>
                </Button>
            </div>
        </div>
    );
}