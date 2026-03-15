"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
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
import { Alert, AlertStatus } from "@/lib/supabase/types";
import { toast } from "@/components/ui/enhanced-toast";
import Link from "next/link";

const severityConfig = {
    critical: {
        label: "Critical",
        color: "text-destructive",
        bg: "bg-destructive/10",
        border: "border-destructive/20",
        dot: "bg-destructive",
        icon: "⚠️",
        ariaLabel: "Critical severity alert",
    },
    high: {
        label: "High",
        color: "text-orange-500",
        bg: "bg-orange-500/10",
        border: "border-orange-500/20",
        dot: "bg-orange-500",
        icon: "⚡",
        ariaLabel: "High severity alert",
    },
    medium: {
        label: "Medium",
        color: "text-amber-500",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
        dot: "bg-amber-500",
        icon: "⚠️",
        ariaLabel: "Medium severity alert",
    },
    low: {
        label: "Low",
        color: "text-primary",
        bg: "bg-primary/10",
        border: "border-primary/20",
        dot: "bg-primary",
        icon: "ℹ️",
        ariaLabel: "Low severity alert",
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

interface AlertRowProps {
    alert: Alert;
    isSelected: boolean;
    onSelect: (id: string | null) => void;
    onUpdate: (id: string, updates: Partial<Alert>) => void;
    currentTime: number;
    showActions?: boolean;
    compact?: boolean;
}

export function AlertRow({
    alert,
    isSelected,
    onSelect,
    onUpdate,
    currentTime,
    showActions = true,
    compact = false
}: AlertRowProps) {
    const sev = severityConfig[alert.severity] ?? severityConfig.medium;

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

    // Resolve alert
    const handleResolve = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const next = nextStatus[alert.status];
        if (!next) return;

        const now = new Date().toISOString();
        const updates: Record<string, string> = { status: next };
        if (next === "ACKNOWLEDGED") updates.acknowledged_at = now;
        if (next === "INVESTIGATED") updates.investigated_at = now;
        if (next === "CLOSED") updates.closed_at = now;

        const previousStatus = alert.status;
        onUpdate(alert.id, updates as never);

        // Show undoable toast
        toast.undoable(
            `Alert marked as ${next.toLowerCase()}`,
            () => {
                // Undo action
                onUpdate(alert.id, { status: previousStatus } as never);
            },
            {
                type: "success",
                undoLabel: "Undo",
                duration: 6000,
            }
        );
    };

    // Dismiss alert
    const handleDismiss = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const now = new Date().toISOString();
        const previousStatus = alert.status;
        onUpdate(alert.id, { status: "CLOSED", closed_at: now } as never);

        // Show undoable toast
        toast.undoable(
            "Alert dismissed",
            () => {
                // Undo action
                onUpdate(alert.id, { status: previousStatus } as never);
            },
            {
                type: "success",
                undoLabel: "Undo",
                duration: 6000,
            }
        );
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            className={cn(
                "group px-4 lg:px-5 py-3 lg:py-3.5 hover:bg-muted/30 cursor-pointer transition-colors",
                isSelected && "bg-muted/50",
                compact && "py-2"
            )}
            onClick={() => onSelect(isSelected ? null : alert.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(isSelected ? null : alert.id);
                }
            }}
            aria-label={`${sev.ariaLabel}: ${alert.title} from ${alert.device_name}`}
        >
            <div className="flex items-start gap-2 lg:gap-3">
                <div
                    className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5", sev.dot)}
                    aria-hidden="true"
                />

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
                            aria-label={`Severity: ${sev.label}`}
                        >
                            <span className="sr-only">Severity: </span>
                            {sev.icon} {sev.label}
                        </span>
                        {/* Anomaly score badge */}
                        <span
                            className={cn(
                                "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full border w-fit shrink-0",
                                confidenceBadgeClass(alert.anomaly_score ?? alert.confidence)
                            )}
                            aria-label={`Confidence: ${((alert.anomaly_score ?? alert.confidence) * 100).toFixed(0)}%`}
                        >
                            <span className="sr-only">Confidence: </span>
                            {((alert.anomaly_score ?? alert.confidence) * 100).toFixed(0)}%
                        </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <MonitorSmartphone className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{alert.device_name}</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span aria-label={`Created ${relativeTime(alert.created_at)}`}>
                                {relativeTime(alert.created_at)}
                            </span>
                        </span>
                        <span className="text-muted-foreground/70 hidden sm:inline" aria-label={`Status: ${alert.status.replace("_", " ")}`}>
                            {alert.status.replace("_", " ")}
                        </span>
                    </div>
                </div>

                {showActions && (
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                            aria-label="Resolve alert"
                            className="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center hover:bg-green-500/20 transition-colors"
                            onClick={handleResolve}
                        >
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        </button>
                        <button
                            aria-label="Dismiss alert"
                            className="w-7 h-7 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center hover:bg-destructive/20 transition-colors"
                            onClick={handleDismiss}
                        >
                            <X className="h-3.5 w-3.5 text-destructive" />
                        </button>
                    </div>
                )}
                <ChevronRight
                    className={cn(
                        "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 mt-0.5",
                        isSelected && "rotate-90"
                    )}
                />
            </div>

            {/* Expanded detail */}
            <AnimatePresence>
                {isSelected && !compact && (
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
                                    <Link href={`/dashboard/alerts/${alert.id}`}>
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
}

export { severityConfig, confidenceBadgeClass, nextStatus };
