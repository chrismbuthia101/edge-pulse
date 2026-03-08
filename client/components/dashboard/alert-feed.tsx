"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronRight, Clock, MonitorSmartphone, CheckCircle2, X, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const severityConfig = {
    critical: { label: "Critical", color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20", dot: "bg-destructive" },
    high: { label: "High", color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", dot: "bg-orange-500" },
    medium: { label: "Medium", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20", dot: "bg-amber-500" },
    low: { label: "Low", color: "text-primary", bg: "bg-primary/10", border: "border-primary/20", dot: "bg-primary" },
};

const mockAlerts = [
    { id: "1", title: "Process Injection Detected", device: "dev-laptop-07", time: "2m ago", severity: "critical" as const, status: "PENDING", confidence: 0.97, category: "Malware" },
    { id: "2", title: "Unusual Outbound Traffic", device: "srv-prod-01", time: "8m ago", severity: "high" as const, status: "PENDING", confidence: 0.91, category: "Network" },
    { id: "3", title: "Auth Brute-force Attempt", device: "ws-finance-03", time: "15m ago", severity: "high" as const, status: "IN_REVIEW", confidence: 0.88, category: "Auth" },
    { id: "4", title: "Privilege Escalation Attempt", device: "srv-db-02", time: "22m ago", severity: "critical" as const, status: "PENDING", confidence: 0.95, category: "Malware" },
    { id: "5", title: "Port Scan Detected", device: "gw-primary", time: "34m ago", severity: "medium" as const, status: "IN_REVIEW", confidence: 0.82, category: "Network" },
    { id: "6", title: "Anomalous Login Time", device: "dev-macbook-12", time: "1h ago", severity: "low" as const, status: "CLOSED", confidence: 0.73, category: "Auth" },
];

export function AlertFeed() {
    const [filter, setFilter] = useState<"ALL" | "PENDING" | "IN_REVIEW" | "CLOSED">("ALL");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const filtered = filter === "ALL" ? mockAlerts : mockAlerts.filter((a) => a.status === filter);

    return (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <h3 className="text-sm font-semibold text-foreground">Active Alerts</h3>
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30">
                        {mockAlerts.filter((a) => a.status === "PENDING").length}
                    </span>
                </div>

                {/* Filter tabs */}
                <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                    {(["ALL", "PENDING", "IN_REVIEW", "CLOSED"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                                "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                                filter === f
                                    ? "bg-card text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {f === "IN_REVIEW" ? "Review" : f.charAt(0) + f.slice(1).toLowerCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* Alert list */}
            <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
                <AnimatePresence mode="popLayout">
                    {filtered.map((alert, i) => {
                        const sev = severityConfig[alert.severity];
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
                                    "group px-5 py-3.5 hover:bg-muted/30 cursor-pointer transition-colors",
                                    isSelected && "bg-muted/50"
                                )}
                                onClick={() => setSelectedId(isSelected ? null : alert.id)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn("w-2 h-2 rounded-full shrink-0", sev.dot)} />

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-sm font-medium text-foreground truncate">
                                                {alert.title}
                                            </span>
                                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", sev.bg, sev.color, sev.border)}>
                                                {sev.label}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <MonitorSmartphone className="h-3 w-3" />
                                                {alert.device}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {alert.time}
                                            </span>
                                            <span className="text-primary font-medium">
                                                {(alert.confidence * 100).toFixed(0)}% confidence
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center hover:bg-green-500/20 transition-colors">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                        </button>
                                        <button className="w-7 h-7 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center hover:bg-destructive/20 transition-colors">
                                            <X className="h-3.5 w-3.5 text-destructive" />
                                        </button>
                                    </div>
                                    <ChevronRight
                                        className={cn(
                                            "h-3.5 w-3.5 text-muted-foreground transition-transform",
                                            isSelected && "rotate-90"
                                        )}
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
                                            <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-3">
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Category</p>
                                                    <p className="text-xs font-medium text-foreground">{alert.category}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Status</p>
                                                    <p className="text-xs font-medium text-foreground">{alert.status.replace("_", " ")}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Confidence</p>
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="flex-1 h-1 bg-muted rounded-full">
                                                            <div
                                                                className="h-full bg-primary rounded-full"
                                                                style={{ width: `${alert.confidence * 100}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-mono font-bold text-primary">
                                                            {(alert.confidence * 100).toFixed(0)}%
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="col-span-3 pt-2">
                                                    <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
                                                        <Eye className="h-3 w-3" />
                                                        View Full Analysis
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
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    Showing {filtered.length} of {mockAlerts.length} alerts
                </p>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    View All Alerts
                    <ChevronRight className="h-3 w-3" />
                </Button>
            </div>
        </div>
    );
}