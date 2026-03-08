"use client";

import { motion } from "framer-motion";
import { MonitorSmartphone, Laptop, Server, Wifi, WifiOff, Shield, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const devices = [
    { id: "1", name: "srv-prod-01", type: "server", status: "online", risk: "high", alerts: 3, os: "Ubuntu 22.04", lastSeen: "Just now" },
    { id: "2", name: "dev-laptop-07", type: "laptop", status: "online", risk: "critical", alerts: 5, os: "macOS 14", lastSeen: "Just now" },
    { id: "3", name: "ws-finance-03", type: "workstation", status: "online", risk: "medium", alerts: 1, os: "Windows 11", lastSeen: "2m ago" },
    { id: "4", name: "srv-db-02", type: "server", status: "online", risk: "critical", alerts: 2, os: "RHEL 9", lastSeen: "Just now" },
    { id: "5", name: "gw-primary", type: "server", status: "online", risk: "medium", alerts: 1, os: "pfSense", lastSeen: "5m ago" },
    { id: "6", name: "dev-macbook-12", type: "laptop", status: "online", risk: "low", alerts: 0, os: "macOS 14", lastSeen: "12m ago" },
    { id: "7", name: "srv-backup-01", type: "server", status: "offline", risk: "none", alerts: 0, os: "Debian 12", lastSeen: "2h ago" },
    { id: "8", name: "ws-eng-05", type: "workstation", status: "online", risk: "low", alerts: 0, os: "Windows 11", lastSeen: "3m ago" },
];

const riskConfig = {
    critical: { color: "text-destructive", bg: "bg-destructive/10", label: "Critical" },
    high: { color: "text-orange-500", bg: "bg-orange-500/10", label: "High" },
    medium: { color: "text-amber-500", bg: "bg-amber-500/10", label: "Medium" },
    low: { color: "text-primary", bg: "bg-primary/10", label: "Low" },
    none: { color: "text-green-500", bg: "bg-green-500/10", label: "Clean" },
};

function DeviceIcon({ type }: { type: string }) {
    if (type === "server") return <Server className="h-3.5 w-3.5" />;
    if (type === "laptop") return <Laptop className="h-3.5 w-3.5" />;
    return <MonitorSmartphone className="h-3.5 w-3.5" />;
}

export function DeviceList() {
    return (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <MonitorSmartphone className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Device Fleet</h3>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        {devices.filter((d) => d.status === "online").length} Online
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                        {devices.filter((d) => d.status === "offline").length} Offline
                    </span>
                </div>
            </div>

            <div className="divide-y divide-border max-h-[380px] overflow-y-auto">
                {devices.map((device, i) => {
                    const risk = riskConfig[device.risk as keyof typeof riskConfig];
                    return (
                        <motion.div
                            key={device.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.04 }}
                            className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors cursor-pointer group"
                        >
                            {/* Device icon + status */}
                            <div className="relative w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                <DeviceIcon type={device.type} />
                                <div
                                    className={cn(
                                        "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-card",
                                        device.status === "online" ? "bg-green-500" : "bg-muted-foreground/40"
                                    )}
                                />
                            </div>

                            {/* Device info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground font-mono">{device.name}</p>
                                <p className="text-xs text-muted-foreground">{device.os} · {device.lastSeen}</p>
                            </div>

                            {/* Risk badge */}
                            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", risk.bg, risk.color)}>
                                {risk.label}
                            </span>

                            {/* Alerts count */}
                            {device.alerts > 0 ? (
                                <div className="flex items-center gap-1 text-xs text-destructive">
                                    <AlertTriangle className="h-3 w-3" />
                                    <span className="font-bold">{device.alerts}</span>
                                </div>
                            ) : (
                                <Shield className="h-3.5 w-3.5 text-green-500" />
                            )}

                            {/* Online/offline indicator */}
                            {device.status === "online" ? (
                                <Wifi className="h-3.5 w-3.5 text-muted-foreground/50" />
                            ) : (
                                <WifiOff className="h-3.5 w-3.5 text-muted-foreground/30" />
                            )}
                        </motion.div>
                    );
                })}
            </div>

            <div className="px-5 py-3 border-t border-border">
                <button className="text-xs text-primary hover:underline">
                    View all {devices.length} devices →
                </button>
            </div>
        </div>
    );
}