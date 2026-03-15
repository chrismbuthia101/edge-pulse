"use client";

import { motion } from "framer-motion";
import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

const services = [
    { name: "ML Inference Engine", status: "operational", latency: "12ms" },
    { name: "Alert Pipeline", status: "operational", latency: "4ms" },
    { name: "Device Sync Service", status: "degraded", latency: "340ms" },
    { name: "SHAP Explainer", status: "operational", latency: "28ms" },
    { name: "Database Cluster", status: "operational", latency: "6ms" },
    { name: "Backup Service", status: "down", latency: "—" },
];

const statusConfig = {
    operational: { label: "Operational", color: "text-green-500", bg: "bg-green-500", dot: "bg-green-500" },
    degraded: { label: "Degraded", color: "text-amber-500", bg: "bg-amber-500", dot: "bg-amber-500" },
    down: { label: "Down", color: "text-destructive", bg: "bg-destructive", dot: "bg-destructive" },
};

export function SystemHealth() {
    const operational = useMemo(() => services.filter((s) => s.status === "operational").length, []);
    const total = useMemo(() => services.length, []);
    const uptime = 99.94;

    return (
        <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <HeartPulse className="h-4 w-4 text-green-500 shrink-0" />
                    <h3 className="text-sm font-semibold text-foreground truncate">System Health</h3>
                </div>
                <div className="flex items-center gap-2 lg:gap-3 text-xs min-w-0">
                    <span className="text-muted-foreground">Uptime</span>
                    <span className="font-bold text-green-500">{uptime}%</span>
                </div>
            </div>

            {/* Overall health bar */}
            <div className="px-4 lg:px-5 pt-4 pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0 text-xs text-muted-foreground mb-2">
                    <span>{operational}/{total} services operational</span>
                    <span className={operational === total ? "text-green-500" : "text-amber-500"}>
                        {operational === total ? "Healthy" : "Partially Degraded"}
                    </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden flex gap-0.5">
                    {services.map((s, i) => {
                        const cfg = statusConfig[s.status as keyof typeof statusConfig];
                        return (
                            <motion.div
                                key={i}
                                className={`flex-1 rounded-sm ${cfg.bg}`}
                                initial={{ scaleY: 0 }}
                                animate={{ scaleY: 1 }}
                                transition={{ delay: i * 0.08, duration: 0.3 }}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Service list */}
            <div className="px-4 lg:px-5 pb-4 space-y-2">
                {services.map((service, i) => {
                    const cfg = statusConfig[service.status as keyof typeof statusConfig];
                    return (
                        <motion.div
                            key={service.name}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.1 + i * 0.05 }}
                            className="flex items-center gap-2 lg:gap-3"
                        >
                            <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />
                            <span className="flex-1 text-xs text-foreground truncate">{service.name}</span>
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">{service.latency}</span>
                            <span className={cn("text-[10px] font-bold shrink-0", cfg.color)}>{cfg.label}</span>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}