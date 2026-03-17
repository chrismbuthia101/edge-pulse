"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    AlertTriangle,
    Bell,
    Command,
    Loader2,
    MonitorSmartphone,
    Search,
    WifiOff,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DynamicBreadcrumb } from "@/components/dashboard/dynamic-breadcrumb";
import { useNotifications } from "@/lib/hooks/use-notifications";
import type { ConnStatus } from "@/lib/hooks/use-notifications";

function useConnConfig(status: ConnStatus, queuedCount: number, isLoading: boolean, hasError: boolean) {
    const configs = {
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
    } satisfies Record<ConnStatus, { icon: React.ReactNode; label: string; classes: string }>;

    const base = configs[status];

    if (isLoading) return { ...base, icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Loading…" };
    if (hasError) return { ...base, icon: <WifiOff className="h-3 w-3" />, label: "Error" };

    return base;
}

interface TopBarProps {
    onMobileMenuToggle?: () => void;
}

export function TopBar({ onMobileMenuToggle }: TopBarProps) {
    const [searchOpen, setSearchOpen] = useState(false);

    const {
        initials,
        displayName,

        connStatus,
        queuedCount,
        isLoading,
        hasError,

        notifOpen,
        toggleNotifications,
        closeNotifications,
        recentNotifs,
        unreadCount,
        handleMarkAllRead,
        handleNotificationClick,
        handleNotificationKeyDown,
        handleViewAllNotifications,

        onlineCount,
    } = useNotifications();

    const conn = useConnConfig(connStatus, queuedCount, isLoading, hasError);

    return (
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-4 lg:px-6 gap-2 lg:gap-4 sticky top-0 z-30">
            {/* Mobile menu toggle */}
            <button
                onClick={onMobileMenuToggle}
                className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Toggle sidebar"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>

            <DynamicBreadcrumb />

            {/* Connectivity badge */}
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
                            key="search-open"
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
                                    placeholder="Search devices, alerts…"
                                    className="pl-9 pr-8 h-9 text-sm w-full sm:w-64"
                                    onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}
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
                            key="search-closed"
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
            <button
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground hover:bg-muted/60 transition-colors"
                aria-label="Open command palette (Press K)"
                type="button"
            >
                <Command className="h-3 w-3" aria-hidden="true" />
                <span>K</span>
            </button>

            {/* Notifications */}
            <div className="relative">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 relative"
                    onClick={toggleNotifications}
                    aria-label={`${unreadCount} unread notifications`}
                    aria-expanded={notifOpen}
                    aria-haspopup="true"
                >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                        <span
                            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive border border-card"
                            aria-hidden="true"
                        />
                    )}
                </Button>

                <AnimatePresence>
                    {notifOpen && (
                        <>
                            {/* Click-outside backdrop */}
                            <div className="fixed inset-0 z-40" onClick={closeNotifications} />

                            <motion.div
                                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                transition={{ duration: 0.15 }}
                                className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card border border-border rounded-xl shadow-xl shadow-black/10 dark:shadow-black/30 z-50 overflow-hidden"
                                role="dialog"
                                aria-label="Notifications"
                                onKeyDown={(e) => { if (e.key === "Escape") closeNotifications(); }}
                            >
                                {/* Panel header */}
                                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                    <span className="text-sm font-semibold text-foreground">
                                        Notifications
                                        {unreadCount > 0 && (
                                            <span className="ml-2 text-xs font-bold text-destructive">
                                                ({unreadCount})
                                            </span>
                                        )}
                                    </span>
                                    <button
                                        onClick={handleMarkAllRead}
                                        className="text-xs text-primary hover:underline"
                                    >
                                        Mark all read
                                    </button>
                                </div>

                                {/* Notification items */}
                                <div className="divide-y divide-border max-h-80 overflow-y-auto">
                                    {recentNotifs.length === 0 ? (
                                        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                                            No notifications
                                        </div>
                                    ) : (
                                        recentNotifs.map((alert, index) => (
                                            <div
                                                key={alert.id}
                                                data-notif-item={index}
                                                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer focus:bg-muted/50 focus:outline-none"
                                                onClick={() => handleNotificationClick(alert.id)}
                                                onKeyDown={(e) => handleNotificationKeyDown(e, index)}
                                                tabIndex={0}
                                                role="button"
                                                aria-label={`${alert.title} from ${alert.device_name}`}
                                            >
                                                <div
                                                    className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${alert.severity === "critical" ? "bg-destructive/15"
                                                        : alert.severity === "high" ? "bg-orange-500/15"
                                                            : alert.severity === "medium" ? "bg-amber-500/15"
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

                                                {!alert.read && (
                                                    <span
                                                        className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5"
                                                        aria-label="Unread"
                                                    />
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Panel footer */}
                                <div className="px-4 py-2.5 border-t border-border">
                                    <button
                                        className="text-xs text-primary hover:underline w-full text-center"
                                        onClick={handleViewAllNotifications}
                                    >
                                        View all notifications
                                    </button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>

            {/* Quick stats */}
            <div className="hidden md:flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1 text-muted-foreground">
                    <MonitorSmartphone className="h-4 w-4" />
                    <span>{onlineCount}</span>
                </div>
                {queuedCount > 0 && (
                    <div className="flex items-center gap-1 text-yellow-500">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{queuedCount}</span>
                    </div>
                )}
            </div>

            <ThemeToggle />

            {/* User avatar */}
            <div className="flex items-center gap-2.5 ml-2">
                <div
                    className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
                    aria-label={`User: ${displayName}`}
                >
                    <span className="text-xs font-bold text-primary">{initials}</span>
                </div>
                <div className="hidden md:block min-w-0">
                    <p className="text-xs font-medium text-foreground leading-none mb-0.5 truncate">
                        {displayName}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-none">Administrator</p>
                </div>
            </div>
        </header>
    );
}