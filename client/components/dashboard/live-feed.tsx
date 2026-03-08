"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Shield, AlertTriangle, MonitorSmartphone, Lock } from "lucide-react";

const baseEvents = [
    { id: "1", type: "threat", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", title: "Process injection blocked", device: "dev-laptop-07", time: "00:02" },
    { id: "2", type: "threat", icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-500/10", title: "Unusual outbound traffic", device: "srv-prod-01", time: "00:05" },
    { id: "3", type: "device", icon: MonitorSmartphone, color: "text-primary", bg: "bg-primary/10", title: "New device enrolled", device: "dev-macbook-12", time: "00:09" },
    { id: "4", type: "auth", icon: Lock, color: "text-amber-500", bg: "bg-amber-500/10", title: "Auth brute-force blocked", device: "ws-finance-03", time: "00:11" },
    { id: "5", type: "ok", icon: Shield, color: "text-green-500", bg: "bg-green-500/10", title: "Threat neutralized", device: "gw-primary", time: "00:15" },
    { id: "6", type: "threat", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", title: "Privilege escalation attempt", device: "srv-db-02", time: "00:18" },
    { id: "7", type: "ok", icon: Shield, color: "text-green-500", bg: "bg-green-500/10", title: "Model updated to v2.4.1", device: "All devices", time: "00:24" },
];

const liveEvents = [
    { id: "8", type: "threat", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", title: "Port scan detected", device: "gw-failover", time: "Live" },
    { id: "9", type: "ok", icon: Shield, color: "text-green-500", bg: "bg-green-500/10", title: "Vulnerability patched", device: "srv-prod-01", time: "Live" },
];

export function LiveFeed() {
    const [events, setEvents] = useState(baseEvents);
    const [isLive] = useState(true);

    useEffect(() => {
        if (!isLive) return;
        let idx = 0;
        const interval = setInterval(() => {
            if (idx < liveEvents.length) {
                setEvents((prev) => [{ ...liveEvents[idx], time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
                idx++;
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [isLive]);

    return (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-green-500" />
                    <h3 className="text-sm font-semibold text-foreground">Live Event Feed</h3>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">Live</span>
                </div>
            </div>

            <div className="divide-y divide-border max-h-80 overflow-y-auto">
                <AnimatePresence mode="popLayout">
                    {events.map((ev) => (
                        <motion.div
                            key={ev.id}
                            layout
                            initial={{ opacity: 0, y: -16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex items-start gap-3 px-5 py-3 hover:bg-muted/30 transition-colors"
                        >
                            <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${ev.bg}`}>
                                <ev.icon className={`h-3.5 w-3.5 ${ev.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground">{ev.title}</p>
                                <p className="text-xs text-muted-foreground font-mono">{ev.device}</p>
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">{ev.time}</span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}