"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    AlertTriangle,
    Brain,
    CheckCircle2,
    ChevronRight,
    Clock,
    Cpu,
    Eye,
    Loader2,
    MonitorSmartphone,
    X,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type AlertFilter, useAlerts } from "@/lib/hooks/use-alerts";
import type { AlertStatus } from "@/lib/supabase/types";

// ─── Config ────────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
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
} as const;

const FILTER_LABELS: Record<AlertFilter, string> = {
    ALL: "All",
    PENDING: "Pending",
    IN_REVIEW: "Review",
    CLOSED: "Closed",
};

const EMPTY_MESSAGES: Record<AlertFilter, string> = {
    ALL: "No active alerts",
    PENDING: "No pending alerts",
    IN_REVIEW: "No alerts under review",
    CLOSED: "No closed alerts",
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function AlertFeed() {
    const {
        alerts,
        filtered,
        pendingCount,
        loading,
        filter,
        setFilter,
        selectedId,
        toggleSelected,
        handleResolve,
        handleDismiss,
        relativeTime,
    } = useAlerts();

    return (
        <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
            {/* ── Header ── */}
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

                    {loading && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                    )}
                </div>

                {/* Filter tabs */}
                <div
                    className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5 overflow-x-auto"
                    role="tablist"
                    aria-label="Alert filters"
                >
                    {(["ALL", "PENDING", "IN_REVIEW", "CLOSED"] as AlertFilter[]).map((f) => (
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
                            {FILTER_LABELS[f]}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Alert list ── */}
            <div
                id="alert-list"
                role="tabpanel"
                aria-label={`Filtered alerts: ${filter.toLowerCase()}`}
                className="divide-y divide-border max-h-[350px] lg:max-h-[420px] overflow-y-auto"
            >
                <AnimatePresence mode="popLayout">
                    {filtered.map((alert, i) => {
                        const sev = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.medium;
                        const isSelected = selectedId === alert.id;
                        const score = alert.anomaly_score ?? alert.confidence;

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
                                onClick={() => toggleSelected(alert.id)}
                            >
                                <div className="flex items-start gap-2 lg:gap-3">
                                    <div className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5",
                                        alert.severity === 'critical' ? 'bg-destructive shadow-[0_0_6px_#ef4444]' :
                                            alert.severity === 'high' ? 'bg-orange-500 shadow-[0_0_6px_#f97316]' : sev.dot
                                    )} />

                                    <div className="flex-1 min-w-0">
                                        {/* Title row */}
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
                                            <div className="flex items-center gap-1.5 flex-1">
                                                <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-linear-to-r from-amber-500 to-destructive"
                                                        style={{ width: `${score * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-mono font-bold text-destructive">{(score * 100).toFixed(0)}%</span>
                                            </div>
                                        </div>

                                        {/* Meta row */}
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

                                    {/* Action buttons (visible on hover) */}
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <button
                                            aria-label="Advance alert status"
                                            className="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center hover:bg-green-500/20 transition-colors"
                                            onClick={(e) => handleResolve(e, alert.id, alert.status as AlertStatus)}
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

                                {/* Expanded detail panel */}
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

                                                <div>
                                                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                                                        Status
                                                    </p>
                                                    <p className="text-xs font-medium text-foreground">
                                                        {alert.status.replace(/_/g, " ")}
                                                    </p>
                                                </div>

                                                {/* Anomaly score bar */}
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                                                        Anomaly Score
                                                    </p>
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full bg-linear-to-r from-amber-500 to-destructive"
                                                                style={{ width: `${score * 100}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-mono font-bold text-destructive">
                                                            {(score * 100).toFixed(0)}%
                                                        </span>
                                                    </div>
                                                </div>

                                                {alert.model_id && (
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                                                            <Brain className="h-2.5 w-2.5" /> Model
                                                        </p>
                                                        <p className="text-xs font-mono text-foreground">{alert.model_id}</p>
                                                    </div>
                                                )}

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
                                                        <Link href="/dashboard/alerts">
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

                {/* Loading state */}
                {loading && alerts.length === 0 && (
                    <div className="p-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Loading alerts…</p>
                    </div>
                )}

                {/* Empty state */}
                {!loading && filtered.length === 0 && (
                    <div className="p-8 text-center">
                        <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">{EMPTY_MESSAGES[filter]}</p>
                    </div>
                )}
            </div>

            {/* ── Footer ── */}
            <div className="px-4 lg:px-5 py-3 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    Showing {filtered.length} of {alerts.length} alerts
                </p>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 w-full sm:w-auto justify-center"
                    asChild
                >
                    <Link href="/dashboard/alerts">
                        View All Alerts
                        <ChevronRight className="h-3 w-3" />
                    </Link>
                </Button>
            </div>
        </div>
    );
}