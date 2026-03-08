"use client";

import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const severityConfig = {
    critical: { label: "Critical", color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20", dot: "bg-destructive" },
    high: { label: "High", color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", dot: "bg-orange-500" },
    medium: { label: "Medium", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20", dot: "bg-amber-500" },
    low: { label: "Low", color: "text-primary", bg: "bg-primary/10", border: "border-primary/20", dot: "bg-primary" },
};

const allAlerts = [
    { id: "1", title: "Process Injection Detected", device: "dev-laptop-07", time: "2m ago", severity: "critical" as const, status: "PENDING", confidence: 0.97, category: "Malware", description: "Suspicious process attempted to inject code into explorer.exe. Automatically contained." },
    { id: "2", title: "Unusual Outbound Traffic", device: "srv-prod-01", time: "8m ago", severity: "high" as const, status: "PENDING", confidence: 0.91, category: "Network", description: "Large data exfiltration attempt to unknown external IP detected." },
    { id: "3", title: "Auth Brute-force Attempt", device: "ws-finance-03", time: "15m ago", severity: "high" as const, status: "IN_REVIEW", confidence: 0.88, category: "Auth", description: "Over 200 failed login attempts in 60 seconds from single source." },
    { id: "4", title: "Privilege Escalation Attempt", device: "srv-db-02", time: "22m ago", severity: "critical" as const, status: "PENDING", confidence: 0.95, category: "Malware", description: "Attempt to gain root privileges through kernel exploit CVE-2024-1234." },
    { id: "5", title: "Port Scan Detected", device: "gw-primary", time: "34m ago", severity: "medium" as const, status: "IN_REVIEW", confidence: 0.82, category: "Network", description: "Systematic port scan across 1-65535 detected from internal subnet." },
    { id: "6", title: "Anomalous Login Time", device: "dev-macbook-12", time: "1h ago", severity: "low" as const, status: "CLOSED", confidence: 0.73, category: "Auth", description: "User logged in at 3:14 AM, outside normal business hours." },
    { id: "7", title: "Suspicious Registry Modification", device: "ws-eng-05", time: "2h ago", severity: "medium" as const, status: "CLOSED", confidence: 0.79, category: "Malware", description: "Modification to HKLM run keys detected, may indicate persistence mechanism." },
    { id: "8", title: "DNS Tunneling Attempt", device: "srv-prod-03", time: "3h ago", severity: "high" as const, status: "IN_REVIEW", confidence: 0.86, category: "Network", description: "Unusual DNS query patterns suggest data exfiltration via DNS tunneling." },
];

type Status = "ALL" | "PENDING" | "IN_REVIEW" | "CLOSED";
type SeverityFilter = "ALL" | "critical" | "high" | "medium" | "low";

export default function AlertsPage() {
    const [statusFilter, setStatusFilter] = useState<Status>("ALL");
    const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const filtered = allAlerts.filter((a) => {
        const matchesStatus = statusFilter === "ALL" || a.status === statusFilter;
        const matchesSeverity = severityFilter === "ALL" || a.severity === severityFilter;
        const matchesSearch = a.title.toLowerCase().includes(search.toLowerCase()) || a.device.toLowerCase().includes(search.toLowerCase());
        return matchesStatus && matchesSeverity && matchesSearch;
    });

    const counts = {
        PENDING: allAlerts.filter((a) => a.status === "PENDING").length,
        IN_REVIEW: allAlerts.filter((a) => a.status === "IN_REVIEW").length,
        CLOSED: allAlerts.filter((a) => a.status === "CLOSED").length,
        critical: allAlerts.filter((a) => a.severity === "critical").length,
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
                    <p className="text-sm text-muted-foreground mt-0.5">Manage and investigate security alerts</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5">
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Alert Rules
                    </Button>
                    <Button size="sm" className="gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Mark All Reviewed
                    </Button>
                </div>
            </motion.div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "Pending", value: counts.PENDING, color: "text-destructive", bg: "bg-destructive/10" },
                    { label: "In Review", value: counts.IN_REVIEW, color: "text-amber-500", bg: "bg-amber-500/10" },
                    { label: "Closed Today", value: counts.CLOSED, color: "text-green-500", bg: "bg-green-500/10" },
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
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                        {(["ALL", "PENDING", "IN_REVIEW", "CLOSED"] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setStatusFilter(f)}
                                className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-all", statusFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
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
                                className={cn("px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all", severityFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
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
                            const sev = severityConfig[alert.severity];
                            const isSelected = selectedId === alert.id;
                            return (
                                <motion.div
                                    key={alert.id}
                                    layout
                                    initial={{ opacity: 0, x: -16 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 16 }}
                                    transition={{ delay: i * 0.03, duration: 0.2 }}
                                    className={cn("group px-5 py-4 hover:bg-muted/30 cursor-pointer transition-colors", isSelected && "bg-muted/50")}
                                    onClick={() => setSelectedId(isSelected ? null : alert.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn("w-2 h-2 rounded-full shrink-0", sev.dot)} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-medium text-foreground truncate">{alert.title}</span>
                                                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", sev.bg, sev.color, sev.border)}>{sev.label}</span>
                                                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{alert.category}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                <span className="flex items-center gap-1"><MonitorSmartphone className="h-3 w-3" />{alert.device}</span>
                                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{alert.time}</span>
                                                <span className="text-primary font-medium">{(alert.confidence * 100).toFixed(0)}% confidence</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center hover:bg-green-500/20">
                                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                            </button>
                                            <button className="w-7 h-7 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center hover:bg-destructive/20">
                                                <X className="h-3.5 w-3.5 text-destructive" />
                                            </button>
                                        </div>
                                        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isSelected && "rotate-90")} />
                                    </div>

                                    <AnimatePresence>
                                        {isSelected && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="mt-4 pt-4 border-t border-border space-y-3">
                                                    <p className="text-sm text-muted-foreground">{alert.description}</p>
                                                    <div className="grid grid-cols-3 gap-3">
                                                        <div>
                                                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Status</p>
                                                            <p className="text-xs font-medium text-foreground">{alert.status.replace("_", " ")}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Confidence</p>
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="flex-1 h-1 bg-muted rounded-full">
                                                                    <div className="h-full bg-primary rounded-full" style={{ width: `${alert.confidence * 100}%` }} />
                                                                </div>
                                                                <span className="text-xs font-mono font-bold text-primary">{(alert.confidence * 100).toFixed(0)}%</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-end">
                                                            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
                                                                <Eye className="h-3 w-3" />
                                                                Full Analysis
                                                            </Button>
                                                        </div>
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
                        <div className="py-16 text-center text-muted-foreground text-sm">No alerts match your filters.</div>
                    )}
                </div>
                <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Showing {filtered.length} of {allAlerts.length} alerts</p>
                    <Button variant="ghost" size="sm" className="h-7 text-xs">Export CSV</Button>
                </div>
            </div>
        </div>
    );
}