"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Shield,
    AlertTriangle,
    MonitorSmartphone,
    Lock,
    Filter,
    RefreshCw,
    Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const eventTypes = ["all", "threat", "auth", "device", "ok"] as const;
type EventType = (typeof eventTypes)[number];

const baseEvents = [
    { id: "1", type: "threat" as EventType, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", title: "Process injection blocked", device: "dev-laptop-07", time: new Date(Date.now() - 120000).toLocaleTimeString(), severity: "critical" },
    { id: "2", type: "threat" as EventType, icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/20", title: "Unusual outbound traffic detected", device: "srv-prod-01", time: new Date(Date.now() - 300000).toLocaleTimeString(), severity: "high" },
    { id: "3", type: "device" as EventType, icon: MonitorSmartphone, color: "text-primary", bg: "bg-primary/10 border-primary/20", title: "New device enrolled", device: "dev-macbook-12", time: new Date(Date.now() - 540000).toLocaleTimeString(), severity: "info" },
    { id: "4", type: "auth" as EventType, icon: Lock, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20", title: "Auth brute-force blocked", device: "ws-finance-03", time: new Date(Date.now() - 660000).toLocaleTimeString(), severity: "high" },
    { id: "5", type: "ok" as EventType, icon: Shield, color: "text-green-500", bg: "bg-green-500/10 border-green-500/20", title: "Threat neutralized automatically", device: "gw-primary", time: new Date(Date.now() - 900000).toLocaleTimeString(), severity: "ok" },
    { id: "6", type: "threat" as EventType, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", title: "Privilege escalation attempt", device: "srv-db-02", time: new Date(Date.now() - 1080000).toLocaleTimeString(), severity: "critical" },
    { id: "7", type: "ok" as EventType, icon: Shield, color: "text-green-500", bg: "bg-green-500/10 border-green-500/20", title: "ML model updated to v2.4.1", device: "All devices", time: new Date(Date.now() - 1440000).toLocaleTimeString(), severity: "ok" },
    { id: "8", type: "auth" as EventType, icon: Lock, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20", title: "Suspicious login from new location", device: "ws-eng-05", time: new Date(Date.now() - 1800000).toLocaleTimeString(), severity: "medium" },
    { id: "9", type: "device" as EventType, icon: MonitorSmartphone, color: "text-primary", bg: "bg-primary/10 border-primary/20", title: "Device health check passed", device: "srv-backup-01", time: new Date(Date.now() - 2100000).toLocaleTimeString(), severity: "info" },
    { id: "10", type: "threat" as EventType, icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/20", title: "Port scan detected on subnet", device: "gw-failover", time: new Date(Date.now() - 2400000).toLocaleTimeString(), severity: "high" },
];

const newLiveEvents = [
    { id: "11", type: "threat" as EventType, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", title: "Ransomware signature detected", device: "ws-finance-02", severity: "critical" },
    { id: "12", type: "ok" as EventType, icon: Shield, color: "text-green-500", bg: "bg-green-500/10 border-green-500/20", title: "Automated quarantine successful", device: "srv-prod-02", severity: "ok" },
];

const severityColor: Record<string, string> = {
    critical: "text-destructive bg-destructive/10 border-destructive/25",
    high: "text-orange-500 bg-orange-500/10 border-orange-500/25",
    medium: "text-amber-500 bg-amber-500/10 border-amber-500/25",
    info: "text-primary bg-primary/10 border-primary/25",
    ok: "text-green-500 bg-green-500/10 border-green-500/25",
};

export default function LivePage() {
    const [events, setEvents] = useState(baseEvents);
    const [filter, setFilter] = useState<EventType>("all");
    const [paused, setPaused] = useState(false);
    const [eventIdx, setEventIdx] = useState(0);

    useEffect(() => {
        if (paused) return;
        const interval = setInterval(() => {
            if (eventIdx < newLiveEvents.length) {
                const ev = newLiveEvents[eventIdx];
                setEvents((prev) => [
                    { ...ev, time: new Date().toLocaleTimeString() },
                    ...prev.slice(0, 19),
                ]);
                setEventIdx((i) => i + 1);
            }
        }, 6000);
        return () => clearInterval(interval);
    }, [paused, eventIdx]);

    const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);

    return (
        <div className="max-w-[1200px] space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between"
            >
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">Live Event Feed</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Real-time security events across all devices</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPaused((p) => !p)}>
                        <RefreshCw className={`h-3.5 w-3.5 ${!paused ? "animate-spin" : ""}`} style={{ animationDuration: "3s" }} />
                        {paused ? "Resume" : "Pause"}
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5">
                        <Download className="h-3.5 w-3.5" />
                        Export
                    </Button>
                </div>
            </motion.div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "Events Today", value: "1,284", color: "text-foreground" },
                    { label: "Critical", value: "3", color: "text-destructive" },
                    { label: "Blocked", value: "89", color: "text-green-500" },
                    { label: "Monitoring", value: "1,247 devices", color: "text-primary" },
                ].map((s) => (
                    <div key={s.label} className="bg-card border border-border rounded-xl p-4">
                        <p className={`text-xl font-bold font-display ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Live indicator + filters */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">
                        {paused ? "Stream Paused" : "Streaming Live"}
                    </span>
                </div>
                <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground ml-2" />
                    {eventTypes.map((t) => (
                        <button
                            key={t}
                            onClick={() => setFilter(t)}
                            className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${filter === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {/* Event stream */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                    <AnimatePresence mode="popLayout">
                        {filtered.map((ev) => (
                            <motion.div
                                key={ev.id}
                                layout
                                initial={{ opacity: 0, y: -20, backgroundColor: "hsl(var(--primary) / 0.05)" }}
                                animate={{ opacity: 1, y: 0, backgroundColor: "transparent" }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors"
                            >
                                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${ev.bg}`}>
                                    <ev.icon className={`h-3.5 w-3.5 ${ev.color}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground">{ev.title}</p>
                                    <p className="text-xs text-muted-foreground font-mono">{ev.device}</p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${severityColor[ev.severity]}`}>
                                    {ev.severity}
                                </span>
                                <span className="text-xs font-mono text-muted-foreground/60 shrink-0 w-20 text-right">{ev.time}</span>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {filtered.length === 0 && (
                        <div className="py-16 text-center text-muted-foreground text-sm">
                            No events matching this filter.
                        </div>
                    )}
                </div>
                <div className="px-5 py-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">Showing {filtered.length} events · Auto-refreshing every 6s</p>
                </div>
            </div>
        </div>
    );
}