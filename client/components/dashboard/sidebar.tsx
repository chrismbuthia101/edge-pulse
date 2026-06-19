"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  MonitorSmartphone,
  ShieldAlert,
  Shield,
  Activity,
  Brain,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
  LogOut,
  HelpCircle,
  Users,
  FileText,
  BarChart3,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth/useAuth";
import { AuthService } from "@/lib/services/auth-service";
import { AuthRepository } from "@/lib/repositories/auth-repository";
import { useNotifications } from "@/lib/hooks/use-notifications";
import { useAlertStore } from "@/lib/stores/alert-store";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: string;
  roles?: string[];
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const navItems: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
      {
        icon: Activity,
        label: "Live Feed",
        href: "/dashboard/live",
        badge: "LIVE",
      },
    ],
  },
  {
    group: "Detection",
    items: [
      {
        icon: ShieldAlert,
        label: "Alerts",
        href: "/dashboard/alerts",
        badge: "pending",
      },
      { icon: MonitorSmartphone, label: "Devices", href: "/dashboard/devices" },
    ],
  },
  {
    group: "Intelligence",
    items: [
      {
        icon: Brain,
        label: "ML Insights",
        href: "/dashboard/insights",
        roles: ["ADMINISTRATOR"],
      },
      {
        icon: BarChart3,
        label: "Explainability",
        href: "/dashboard/explainability",
        roles: ["ANALYST", "ADMINISTRATOR"],
      },
    ],
  },
  {
    group: "System",
    items: [
      {
        icon: Shield,
        label: "Audit Log",
        href: "/dashboard/audit-log",
        roles: ["ANALYST", "ADMINISTRATOR"],
      },
      {
        icon: Bell,
        label: "Notifications",
        href: "/dashboard/notifications",
        badge: "unread",
      },
    ],
  },
  {
    group: "Admin",
    items: [
      {
        icon: Users,
        label: "Users",
        href: "/dashboard/users",
        roles: ["ADMINISTRATOR"],
      },
      {
        icon: MonitorSmartphone,
        label: "Assignments",
        href: "/dashboard/assignments",
        roles: ["ADMINISTRATOR"],
      },
      {
        icon: FileText,
        label: "Reports",
        href: "/dashboard/reports",
        roles: ["ADMINISTRATOR", "ANALYST"],
      },
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

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { hasRole } = useAuth();
  const focusTrapRef = useFocusTrap(mobileOpen || false);

  const authRepository = new AuthRepository();
  const authService = new AuthService(authRepository);

  const { unreadCount } = useNotifications();
  const { alerts } = useAlertStore();
  const pendingAlertsCount = alerts.filter(
    (a) => a.status === "PENDING",
  ).length;

  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const handleLogout = async () => {
    setLogoutDialogOpen(true);
  };

  const confirmLogout = async () => {
    setLogoutLoading(true);
    const result = await authService.signOut();
    setLogoutLoading(false);
    if (result.success) {
      toast.success("Logged out successfully");
      setLogoutDialogOpen(false);
      router.push("/auth/login");
    } else {
      toast.error(result.error || "Failed to sign out");
    }
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
        className={`fixed left-0 top-0 h-screen bg-card border-r border-border z-40 flex flex-col overflow-hidden dark:bg-linear-to-b dark:from-[#0d1420] dark:to-[#0a1118] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo area */}
        <div className="h-16 flex items-center px-4 border-b border-border shrink-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 overflow-hidden"
            aria-label="EdgePulse Dashboard"
          >
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
        <nav
          className="flex-1 py-4 overflow-y-auto overflow-x-hidden scrollbar-none"
          aria-label="Main navigation"
        >
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

              {group.items
                .filter((item) => {
                  // Check if item has role requirements
                  if (!item.roles) return true;
                  return hasRole(item.roles);
                })
                .map((item) => {
                  const isActive = pathname === item.href;
                  // Convert dynamic badge keys to actual counts
                  let badgeCount = item.badge;
                  if (badgeCount === "pending") {
                    badgeCount =
                      pendingAlertsCount > 0
                        ? String(pendingAlertsCount)
                        : undefined;
                  } else if (badgeCount === "unread") {
                    badgeCount =
                      unreadCount > 0 ? String(unreadCount) : undefined;
                  } else if (badgeCount === "LIVE") {
                    badgeCount = "LIVE";
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 mx-2 px-2 py-2 rounded-lg text-sm transition-all duration-200 group relative",
                        isActive
                          ? "bg-linear-to-r from-primary/15 to-primary/5 text-primary border-l-2 border-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
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
                          isActive
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-foreground",
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
                              : "bg-destructive/15 text-destructive border border-destructive/30",
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
                              : "bg-destructive",
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

      <ConfirmDialog
        open={logoutDialogOpen}
        onOpenChange={setLogoutDialogOpen}
        title="Sign Out"
        description="Are you sure you want to sign out? You will need to sign in again to access the dashboard."
        confirmLabel="Sign Out"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={confirmLogout}
        loading={logoutLoading}
      />
    </>
  );
}
