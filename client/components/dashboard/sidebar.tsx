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
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        toast.success("Logged out successfully");
        router.push("/login");
    };

    return (
        <motion.aside
            initial={false}
            animate={{ width: collapsed ? 68 : 240 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed left-0 top-0 h-screen bg-card border-r border-border z-40 flex flex-col overflow-hidden"
        >
            {/* Logo area */}
            <div className="h-16 flex items-center px-4 border-b border-border shrink-0">
                <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
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
            <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden scrollbar-none">
                {navItems.map((group) => (
                    <div key={group.group} className="mb-4">
                        <AnimatePresence>
                            {!collapsed && (
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="px-4 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60"
                                >
                                    {group.group}
                                </motion.p>
                            )}
                        </AnimatePresence>

                        {group.items.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 mx-2 px-2 py-2 rounded-lg text-sm transition-all duration-200 group relative",
                                        isActive
                                            ? "bg-primary/10 text-primary"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                    )}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="sidebar-active"
                                            className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r-full"
                                        />
                                    )}
                                    <item.icon
                                        className={cn(
                                            "h-4 w-4 shrink-0",
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
                                    {!collapsed && item.badge && (
                                        <span
                                            className={cn(
                                                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                                                item.badge === "LIVE"
                                                    ? "bg-green-500/15 text-green-500 border border-green-500/30"
                                                    : "bg-destructive/15 text-destructive border border-destructive/30"
                                            )}
                                        >
                                            {item.badge}
                                        </span>
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
                <button className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
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
    );
}