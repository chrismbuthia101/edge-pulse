"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Bell,
    AlertTriangle,
    MonitorSmartphone,
    Shield,
    Lock,
    CheckCheck,
    Trash2,
    Settings,
    Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const allNotifications = [
    { id: "1", type: "critical", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", title: "Process Injection Detected", body: "Suspicious process injection into explorer.exe on dev-laptop-07. Automatically blocked.", device: "dev-laptop-07", time: "2 minutes ago", read: false },
    { id: "2", type: "high", icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/20", title: "Unusual Outbound Traffic", body: "Large volume of data transmitted to unrecognized external endpoint from srv-prod-01.", device: "srv-prod-01", time: "8 minutes ago", read: false },
    { id: "3", type: "high", icon: Lock, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20", title: "Auth Brute-force Blocked", body: "Over 200 failed authentication attempts detected and source IP blocked.", device: "ws-finance-03", time: "15 minutes ago", read: false },
    { id: "4", type: "critical", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", title: "Privilege Escalation Attempt", body: "Kernel-level privilege escalation attempt stopped by EdgePulse agent.", device: "srv-db-02", time: "22 minutes ago", read: true },
    { id: "5", type: "info", icon: MonitorSmartphone, color: "text-primary", bg: "bg-primary/10 border-primary/20", title: "New Device Enrolled", body: "dev-macbook-12 successfully enrolled and monitoring agent deployed.", device: "dev-macbook-12", time: "1 hour ago", read: true },
    { id: "6", type: "ok", icon: Shield, color: "text-green-500", bg: "bg-green-500/10 border-green-500/20", title: "Model Updated Successfully", body: "All 1,247 devices updated to ML model v2.4.1. Improved detection accuracy by 0.2%.", device: "All devices", time: "3 hours ago", read: true },
    { id: "7", type: "high", icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/20", title: "DNS Tunneling Attempt", body: "Suspicious DNS query patterns detected — possible data exfiltration via DNS tunneling.", device: "srv-prod-03", time: "5 hours ago", read: true },
    { id: "8", type: "info", icon: Shield, color: "text-primary", bg: "bg-primary/10 border-primary/20", title: "Weekly Security Report Ready", body: "Your weekly security digest for the period ending today is now available.", device: "System", time: "8 hours ago", read: true },
];

type NotifFilter = "all" | "unread" | "critical" | "info";

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState(allNotifications);
    const [filter, setFilter] = useState<NotifFilter>("all");

    const markAllRead = () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    const clearAll = () => setNotifications([]);
    const markRead = (id: string) => setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    const dismiss = (id: string) => setNotifications((prev) => prev.filter((n) => n.id !== id));

    const filtered = notifications.filter((n) => {
        if (filter === "unread") return !n.read;
        if (filter === "critical") return n.type === "critical";
        if (filter === "info") return n.type === "info" || n.type === "ok";
        return true;
    });

    const unreadCount = notifications.filter((n) => !n.read).length;

    return (
        <div className="max-w-[900px] space-y-6">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-display font-bold text-foreground">Notifications</h1>
                        {unreadCount > 0 && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30">
                                {unreadCount} new
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">Security alerts and system notifications</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={markAllRead}>
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark all read
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={clearAll}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear all
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5">
                        <Settings className="h-3.5 w-3.5" />
                        Preferences
                    </Button>
                </div>
            </motion.div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5 w-fit">
                <Filter className="h-3.5 w-3.5 text-muted-foreground ml-2" />
                {(["all", "unread", "critical", "info"] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={cn("px-3 py-1 rounded-md text-xs font-medium capitalize transition-all", filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    >
                        {f}
                        {f === "unread" && unreadCount > 0 && (
                            <span className="ml-1 text-[10px] font-bold text-destructive">({unreadCount})</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Notification list */}
            <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                    {filtered.map((notif, i) => (
                        <motion.div
                            key={notif.id}
                            layout
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: 20, height: 0 }}
                            transition={{ delay: i * 0.04, duration: 0.25 }}
                            className={cn(
                                "group flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                                notif.read ? "bg-card border-border" : "bg-primary/3 border-primary/20",
                            )}
                            onClick={() => markRead(notif.id)}
                        >
                            <div className={`mt-0.5 w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${notif.bg}`}>
                                <notif.icon className={`h-4 w-4 ${notif.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className={cn("text-sm font-semibold", notif.read ? "text-foreground" : "text-foreground")}>{notif.title}</p>
                                            {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{notif.body}</p>
                                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                            <span className="font-mono">{notif.device}</span>
                                            <span>·</span>
                                            <span>{notif.time}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); dismiss(notif.id); }}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-md hover:bg-muted flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground"
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
                {filtered.length === 0 && (
                    <div className="py-20 text-center">
                        <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">No notifications here</p>
                    </div>
                )}
            </div>
        </div>
    );
}