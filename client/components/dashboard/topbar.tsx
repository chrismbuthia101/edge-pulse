"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Bell,
    Search,
    Command,
    X,
    Shield,
    AlertTriangle,
    MonitorSmartphone,
    WifiOff,
    Loader2,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useAlertStore } from "@/stores/alert-store";
import { useDeviceStore } from "@/stores/device-store";
import type { Alert, Device, RealtimeAlertPayload, RealtimeDevicePayload } from "@/lib/supabase/types";

type ConnStatus = "live" | "offline" | "syncing";

interface TopBarProps {
    onMobileMenuToggle?: () => void;
}

export function TopBar({ onMobileMenuToggle }: TopBarProps) {
    const [searchOpen, setSearchOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const [user, setUser] = useState<{ email?: string; full_name?: string } | null>(null);

    const [connStatus, setConnStatus] = useState<ConnStatus>("live");
    const [queuedCount, setQueuedCount] = useState(0);

    const { alerts, setAlerts, addAlert, updateAlert, unreadCount } = useAlertStore();
    const { setDevices, updateDevice } = useDeviceStore();

    const supabase = createClient();
    const supabaseRef = useRef(supabase);

    useEffect(() => {
        supabaseRef.current = supabase;
    }, [supabase]);

    useEffect(() => {
        supabaseRef.current.auth.getUser().then(({ data }) => {
            if (data.user) {
                setUser({
                    email: data.user.email,
                    full_name: data.user.user_metadata?.full_name,
                });
            }
        });
    }, []);

    // Initial data fetch + Realtime subscriptions
    useEffect(() => {
        const sb = supabaseRef.current;
        let mounted = true;

        const fetchAlerts = async () => {
            const { data, error } = await sb
                .from("alert_records")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(100);

            if (!error && data && mounted) {
                setAlerts(data as Alert[]);
            }
        };

        const fetchDevices = async () => {
            const { data, error } = await sb
                .from("devices")
                .select("*")
                .order("name", { ascending: true });

            if (!error && data && mounted) {
                setDevices(data as Device[]);
            }
        };

        const fetchSyncQueue = async () => {
            const { count, error } = await sb
                .from("sync_queue")
                .select("*", { count: "exact", head: true })
                .in("status", ["PENDING", "FAILED"]);

            if (!error && mounted) {
                setQueuedCount(count ?? 0);
            }
        };

        fetchAlerts();
        fetchDevices();
        fetchSyncQueue();

        // Realtime: alerts channel
        const alertsChannel = sb
            .channel("realtime-alerts")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "alert_records" },
                (payload) => {
                    if (!mounted) return;
                    const p = payload as unknown as RealtimeAlertPayload;
                    setConnStatus("live");

                    if (p.eventType === "INSERT") {
                        addAlert(p.new);
                    } else if (p.eventType === "UPDATE") {
                        updateAlert(p.new.id, p.new);
                    }
                }
            )
            .subscribe((status) => {
                if (!mounted) return;
                if (status === "SUBSCRIBED") setConnStatus("live");
                if (status === "CLOSED" || status === "CHANNEL_ERROR") setConnStatus("offline");
                if (status === "TIMED_OUT") setConnStatus("syncing");
            });

        // Realtime: devices channel
        const devicesChannel = sb
            .channel("realtime-devices")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "devices" },
                (payload) => {
                    if (!mounted) return;
                    const p = payload as unknown as RealtimeDevicePayload;
                    if (p.eventType === "UPDATE" || p.eventType === "INSERT") {
                        updateDevice(p.new);
                    }
                }
            )
            .subscribe();

        // Realtime: sync_queue channel
        const syncChannel = sb
            .channel("realtime-sync-queue")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "sync_queue" },
                () => {
                    if (!mounted) return;
                    setConnStatus("syncing");
                    fetchSyncQueue().then(() => {
                        if (mounted) setConnStatus("live");
                    });
                }
            )
            .subscribe();

        // Browser online/offline events
        const handleOnline = () => {
            setConnStatus("syncing");
            // Refetch to catch up on anything missed while offline
            fetchAlerts();
            fetchDevices();
            fetchSyncQueue();
            setTimeout(() => setConnStatus("live"), 2000);
        };
        const handleOffline = () => setConnStatus("offline");

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            mounted = false;
            sb.removeChannel(alertsChannel);
            sb.removeChannel(devicesChannel);
            sb.removeChannel(syncChannel);
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, [addAlert, setAlerts, setDevices, updateAlert, updateDevice]);

    // ── Derived ───────────────────────────────────────────────────────────────
    const initials = user?.full_name
        ? user.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)
        : user?.email?.[0]?.toUpperCase() ?? "U";

    // Recent 4 alerts for the notification dropdown (from live store)
    const recentNotifs = alerts.slice(0, 4);

    // ── Connectivity badge config ─────────────────────────────────────────────
    const connConfig: Record<
        ConnStatus,
        { icon: React.ReactNode; label: string; classes: string }
    > = {
        live: {
            icon: <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />,
            label: "Live",
            classes: "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400",
        },
        offline: {
            icon: <WifiOff className="h-3 w-3" />,
            label: queuedCount > 0 ? `Offline — ${queuedCount} events queued` : "Offline",
            classes: "bg-destructive/10 border-destructive/20 text-destructive",
        },
        syncing: {
            icon: <Loader2 className="h-3 w-3 animate-spin" />,
            label: "Syncing",
            classes: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
        },
    };
    const conn = connConfig[connStatus];

    return (
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-4 lg:px-6 gap-2 lg:gap-4 sticky top-0 z-30">
            {/* Mobile menu button */}
            <button
                onClick={onMobileMenuToggle}
                className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Toggle sidebar"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                <Shield className="h-4 w-4 text-primary shrink-0" />
                <span className="text-foreground font-medium truncate">Dashboard</span>
            </div>

            {/* Persistent connectivity status badge */}
            <div
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all duration-300 ${conn.classes}`}
            >
                {conn.icon}
                <span>{conn.label}</span>
            </div>

            <div className="flex-1 min-w-0" />

            {/* Search */}
            <div className="relative">
                <AnimatePresence>
                    {searchOpen ? (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: "calc(100vw - 2rem)", opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="absolute right-0 top-1/2 -translate-y-1/2 overflow-hidden sm:relative sm:top-0 sm:translate-y-0 sm:w-auto"
                        >
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                    autoFocus
                                    placeholder="Search devices, alerts..."
                                    className="pl-9 pr-8 h-9 text-sm w-full sm:w-64"
                                    onKeyDown={(e) => {
                                        if (e.key === "Escape") setSearchOpen(false);
                                    }}
                                />
                                <button
                                    onClick={() => setSearchOpen(false)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label="Close search"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </motion.div>
                    ) : (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => setSearchOpen(true)}
                            aria-label="Open search"
                        >
                            <Search className="h-4 w-4" />
                        </Button>
                    )}
                </AnimatePresence>
            </div>

            {/* Command palette hint */}
            <button className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground hover:bg-muted/60 transition-colors">
                <Command className="h-3 w-3" />
                <span>K</span>
            </button>

            {/* Notifications */}
            <div className="relative">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 relative"
                    onClick={() => setNotifOpen(!notifOpen)}
                    aria-label={`${unreadCount} unread notifications`}
                >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive border border-card" />
                    )}
                </Button>

                <AnimatePresence>
                    {notifOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                            <motion.div
                                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                transition={{ duration: 0.15 }}
                                className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card border border-border rounded-xl shadow-xl shadow-black/10 dark:shadow-black/30 z-50 overflow-hidden max-h-[80vh] sm:max-h-none"
                            >
                                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                    <span className="text-sm font-semibold text-foreground">
                                        Notifications
                                        {unreadCount > 0 && (
                                            <span className="ml-2 text-xs font-bold text-destructive">
                                                ({unreadCount})
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-xs text-primary hover:underline cursor-pointer">
                                        Mark all read
                                    </span>
                                </div>
                                <div className="divide-y divide-border max-h-80 overflow-y-auto">
                                    {recentNotifs.length === 0 ? (
                                        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                                            No notifications
                                        </div>
                                    ) : (
                                        recentNotifs.map((alert) => (
                                            <div
                                                key={alert.id}
                                                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
                                            >
                                                <div
                                                    className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${alert.severity === "critical"
                                                        ? "bg-destructive/15"
                                                        : alert.severity === "high"
                                                            ? "bg-orange-500/15"
                                                            : alert.severity === "medium"
                                                                ? "bg-amber-500/15"
                                                                : "bg-primary/15"
                                                        }`}
                                                >
                                                    {alert.severity === "critical" || alert.severity === "high" ? (
                                                        <AlertTriangle
                                                            className={`h-3 w-3 ${alert.severity === "critical"
                                                                ? "text-destructive"
                                                                : "text-orange-500"
                                                                }`}
                                                        />
                                                    ) : (
                                                        <MonitorSmartphone
                                                            className={`h-3 w-3 ${alert.severity === "medium"
                                                                ? "text-amber-500"
                                                                : "text-primary"
                                                                }`}
                                                        />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium text-foreground truncate">
                                                        {alert.title}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {alert.device_name} ·{" "}
                                                        {new Date(alert.created_at).toLocaleTimeString()}
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="px-4 py-2.5 border-t border-border">
                                    <button className="text-xs text-primary hover:underline w-full text-center">
                                        View all notifications
                                    </button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>

            <ThemeToggle />

            {/* User avatar */}
            <div className="flex items-center gap-2.5 ml-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">{initials}</span>
                </div>
                <div className="hidden md:block min-w-0">
                    <p className="text-xs font-medium text-foreground leading-none mb-0.5 truncate">
                        {user?.full_name ?? user?.email?.split("@")[0] ?? "User"}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-none">Administrator</p>
                </div>
            </div>
        </header>
    );
}