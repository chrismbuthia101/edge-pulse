"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Search, Command, X, Shield, AlertTriangle, MonitorSmartphone } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

interface TopBarProps {
    onMobileMenuToggle?: () => void;
}

export function TopBar({ onMobileMenuToggle }: TopBarProps) {
    const [searchOpen, setSearchOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const [user, setUser] = useState<{ email?: string; full_name?: string } | null>(null);
    const supabase = createClient();

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data.user) {
                setUser({
                    email: data.user.email,
                    full_name: data.user.user_metadata?.full_name,
                });
            }
        });
    }, [supabase.auth]);

    const initials = user?.full_name
        ? user.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
        : user?.email?.[0]?.toUpperCase() ?? "U";

    const recentNotifs = [
        { id: 1, type: "critical", title: "Process Injection Detected", device: "dev-laptop-07", time: "2m ago" },
        { id: 2, type: "high", title: "Unusual Outbound Traffic", device: "srv-prod-01", time: "8m ago" },
        { id: 3, type: "medium", title: "Auth Brute-force Blocked", device: "ws-finance-03", time: "15m ago" },
        { id: 4, type: "low", title: "New Device Enrolled", device: "dev-macbook-12", time: "1h ago" },
    ];

    return (
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-4 lg:px-6 gap-2 lg:gap-4 sticky top-0 z-30">
            {/* Mobile menu button - only visible on mobile */}
            <button
                onClick={onMobileMenuToggle}
                className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>

            {/* Breadcrumb / page indicator */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                <Shield className="h-4 w-4 text-primary shrink-0" />
                <span className="text-foreground font-medium truncate">Dashboard</span>
            </div>

            {/* Live status badge - hidden on small mobile */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-green-600 dark:text-green-400">All Systems Operational</span>
            </div>

            <div className="flex-1 min-w-0" />

            {/* Search - improved mobile handling */}
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
                                />
                                <button
                                    onClick={() => setSearchOpen(false)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </motion.div>
                    ) : (
                        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSearchOpen(true)}>
                            <Search className="h-4 w-4" />
                        </Button>
                    )}
                </AnimatePresence>
            </div>

            {/* Command palette hint - hidden on mobile */}
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
                >
                    <Bell className="h-4 w-4" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive border border-card" />
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
                                    <span className="text-sm font-semibold text-foreground">Notifications</span>
                                    <span className="text-xs text-primary hover:underline cursor-pointer">Mark all read</span>
                                </div>
                                <div className="divide-y divide-border max-h-80 overflow-y-auto">
                                    {recentNotifs.map((notif) => (
                                        <div key={notif.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                                            <div className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${notif.type === "critical" ? "bg-destructive/15" :
                                                notif.type === "high" ? "bg-orange-500/15" :
                                                    notif.type === "medium" ? "bg-amber-500/15" :
                                                        "bg-primary/15"
                                                }`}>
                                                {notif.type === "critical" || notif.type === "high" ? (
                                                    <AlertTriangle className={`h-3 w-3 ${notif.type === "critical" ? "text-destructive" : "text-orange-500"}`} />
                                                ) : (
                                                    <MonitorSmartphone className={`h-3 w-3 ${notif.type === "medium" ? "text-amber-500" : "text-primary"}`} />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-foreground truncate">{notif.title}</p>
                                                <p className="text-xs text-muted-foreground">{notif.device} · {notif.time}</p>
                                            </div>
                                        </div>
                                    ))}
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