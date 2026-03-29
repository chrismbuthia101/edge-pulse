"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    LayoutDashboard,
    MonitorSmartphone,
    ShieldAlert,
    Activity,
    Brain,
    Settings,
    ChevronLeft,
    ChevronRight,
    Bell,
    LogOut,
    HelpCircle,
    Zap,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFocusTrap } from "@/lib/use-focus-trap";

const navItems = [
    {
        group: "Overview",
        items: [
            { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
            { icon: Activity, label: "Live Feed", href: "/dashboard/live", badge: "LIVE" },
        ],
    },
    {
        group: "Security",
        items: [
            { icon: ShieldAlert, label: "Alerts", href: "/dashboard/alerts", badge: "12" },
            { icon: MonitorSmartphone, label: "Devices", href: "/dashboard/devices" },
            { icon: Brain, label: "ML Insights", href: "/dashboard/insights" },
        ],
    },
    {
        group: "System",
        items: [
            { icon: Bell, label: "Notifications", href: "/dashboard/notifications" },
            { icon: Settings, label: "Settings", href: "/dashboard/settings" },
        ],
    },
];

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
    mobileOpen?: boolean;
    onMobileClose?: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();
    const focusTrapRef = useFocusTrap(mobileOpen || false);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        toast.success("Logged out successfully");
        router.push("/auth/login");
    };

    // Close mobile sidebar when navigating to a new route
    const handleNavigation = () => {
        if (window.innerWidth < 1024 && onMobileClose) {
            onMobileClose();
        }
    };

    return (
        <>
            {/* Mobile overlay */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="lg:hidden fixed inset-0 bg-black/90 z-30"
                        onClick={onMobileClose}
                    />
                )}
            </AnimatePresence>

            <motion.aside
                ref={focusTrapRef}
                initial={false}
                animate={{
                    width: collapsed ? 68 : 240,
                }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className={`fixed left-0 top-0 h-screen bg-card border-r border-border z-40 flex flex-col overflow-hidden dark:bg-linear-to-b dark:from-[#0d1420] dark:to-[#0a1118] ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                    }`}
                role="navigation"
                aria-label="Main navigation"
            >
                {/* Logo area */}
                <div className="h-16 flex items-center px-4 border-b border-border shrink-0">
                    <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden" aria-label="EdgePulse Dashboard">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                            <Logo className="h-5 w-5 text-primary" />
                        </div>
                        <AnimatePresence>
                            {!collapsed && (
                                <motion.span
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    transition={{ duration: 0.2 }}
                                    className="text-base font-display font-bold text-foreground whitespace-nowrap"
                                >
                                    Edge<span className="text-primary">Pulse</span>
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </Link>
                    <div className="ml-auto">
                        <button
                            onClick={onToggle}
                            className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        >
                            {collapsed ? (
                                <ChevronRight className="h-3.5 w-3.5" />
                            ) : (
                                <ChevronLeft className="h-3.5 w-3.5" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden scrollbar-none" aria-label="Main navigation">
                    {navItems.map((group) => (
                        <div key={group.group} className="mb-4">
                            <AnimatePresence>
                                {!collapsed && (
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="px-3 pt-5 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50"
                                    >
                                        {group.group}
                                    </motion.p>
                                )}
                            </AnimatePresence>

                            {group.items.map((item) => {
                                const isActive = pathname === item.href;
                                const badgeCount = item.badge === "12" ? "12" : item.badge;

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            "flex items-center gap-3 mx-2 px-2 py-2 rounded-lg text-sm transition-all duration-200 group relative",
                                            isActive
                                                ? "bg-linear-to-r from-primary/15 to-primary/5 text-primary border-l-2 border-primary"
                                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                        )}
                                        aria-current={isActive ? "page" : undefined}
                                        onClick={handleNavigation}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="sidebar-active"
                                                className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r-full"
                                            />
                                        )}
                                        <item.icon
                                            className={cn(
                                                "h-4 w-4 shrink-0 transition-colors",
                                                isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                                            )}
                                        />
                                        <AnimatePresence>
                                            {!collapsed && (
                                                <motion.span
                                                    initial={{ opacity: 0, x: -8 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: -8 }}
                                                    transition={{ duration: 0.15 }}
                                                    className="flex-1 whitespace-nowrap font-medium"
                                                >
                                                    {item.label}
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                        {!collapsed && badgeCount && (
                                            <motion.span
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.8 }}
                                                className={cn(
                                                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse",
                                                    badgeCount === "LIVE"
                                                        ? "bg-green-500/15 text-green-500 border border-green-500/30"
                                                        : "bg-destructive/15 text-destructive border border-destructive/30"
                                                )}
                                            >
                                                {badgeCount}
                                            </motion.span>
                                        )}
                                        {/* Collapsed state indicators */}
                                        {collapsed && badgeCount && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0 }}
                                                className={cn(
                                                    "absolute -top-1 -right-1 w-2 h-2 rounded-full",
                                                    badgeCount === "LIVE"
                                                        ? "bg-green-500"
                                                        : "bg-destructive"
                                                )}
                                            />
                                        )}
                                        {collapsed && isActive && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0 }}
                                                className="absolute inset-0 bg-primary/5 rounded-lg border border-primary/20 pointer-events-none"
                                            />
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                {/* Threat level indicator */}
                <AnimatePresence>
                    {!collapsed && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mx-3 mb-3"
                        >
                            <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                                        Threat Level: Medium
                                    </span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-amber-500 rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: "55%" }}
                                        transition={{ duration: 1, ease: "easeOut" }}
                                    />
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1.5">
                                    12 active alerts · 3 critical
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Bottom actions */}
                <div className="border-t border-border py-3 px-2 space-y-1">
                    <button
                        className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        aria-label="Help & Support"
                    >
                        <HelpCircle className="h-4 w-4 shrink-0" />
                        <AnimatePresence>
                            {!collapsed && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="whitespace-nowrap"
                                >
                                    Help & Support
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors"
                        aria-label="Sign out"
                    >
                        <LogOut className="h-4 w-4 shrink-0" />
                        <AnimatePresence>
                            {!collapsed && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="whitespace-nowrap"
                                >
                                    Sign Out
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </div>
            </motion.aside>
        </>
    );
}