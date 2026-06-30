"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  Activity,
  CheckCircle2,
  ChevronDown,
  Building2,
  LogOut,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DynamicBreadcrumb } from "@/components/dashboard/dynamic-breadcrumb";
import Image from "next/image";
import { useNotifications } from "@/lib/hooks/use-notifications";
import type { ConnStatus } from "@/lib/hooks/use-notifications";
import { useAuth } from "@/lib/auth/useAuth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useHealthStore } from "@/lib/stores/health-store";
import { toast } from "sonner";

function useConnConfig(
  status: ConnStatus,
  queuedCount: number,
  isLoading: boolean,
  hasError: boolean,
) {
  const configs = {
    live: {
      icon: (
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      ),
      label: "All systems connected",
      subLabel: "",
      classes:
        "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400",
    },
    offline: {
      icon: <WifiOff className="h-3 w-3" />,
      label: queuedCount > 0 ? `Offline — ${queuedCount} queued` : "Offline",
      subLabel: "Connection lost",
      classes: "bg-destructive/10 border-destructive/20 text-destructive",
    },
    syncing: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Syncing events...",
      subLabel: `${queuedCount} events in queue`,
      classes:
        "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
    },
  } satisfies Record<
    ConnStatus,
    { icon: React.ReactNode; label: string; subLabel: string; classes: string }
  >;

  const base = configs[status];

  if (isLoading)
    return {
      ...base,
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Loading…",
      subLabel: "",
    };
  if (hasError)
    return {
      ...base,
      icon: <WifiOff className="h-3 w-3" />,
      label: "Error",
      subLabel: "Connection error",
    };

  return base;
}

interface TopBarProps {
  onMobileMenuToggle?: () => void;
}

export function TopBar({ onMobileMenuToggle }: TopBarProps) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const { role: userRole, hasMultipleOrganizations: hasMultipleOrgs } = useAuth();

  const handleLogout = () => {
    setAvatarMenuOpen(false);
    setLogoutDialogOpen(true);
  };

  const confirmLogout = async () => {
    setLogoutLoading(true);
    const result = await useAuthStore.getState().signOut();
    setLogoutLoading(false);
    if (result.success) {
      toast.success("Logged out successfully");
      setLogoutDialogOpen(false);
      router.push("/auth/login");
    } else {
      toast.error(result.error || "Failed to sign out");
    }
  };

  const {
    initials,
    displayName,
    avatarUrl,

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

  const healthEvents = useHealthStore((s) => s.systemHealth?.total_alerts_24h ?? 0);
  const eventsPerMin = onlineCount > 0 ? Math.max(1, Math.round(healthEvents / 5)) : 0;

  const conn = useConnConfig(connStatus, queuedCount, isLoading, hasError);

  return (
    <header className="h-16 border-b border-border/50 bg-card/80 backdrop-blur-xl flex items-center px-4 lg:px-6 gap-2 lg:gap-4 sticky top-0 z-30 shadow-sm shadow-black/5 dark:shadow-black/20">
      {/* Mobile menu toggle */}
      <button
        onClick={onMobileMenuToggle}
        className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Toggle sidebar"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      <DynamicBreadcrumb />

      {/* Connectivity badge - clickable */}
      <div className="relative">
        <button
          onClick={() => setSyncPanelOpen(!syncPanelOpen)}
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium transition-all duration-300 ${conn.classes}`}
          aria-label="View sync status"
        >
          {conn.icon}
          <span>{conn.label}</span>
          <ChevronDown className="h-3 w-3 ml-0.5" />
        </button>

        <AnimatePresence>
          {syncPanelOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSyncPanelOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ type: "spring", duration: 0.2, bounce: 0.1 }}
                className="absolute right-0 top-full mt-2 w-72 bg-linear-to-b from-card to-card/80 backdrop-blur-xl border border-border border-t-2 rounded-xl shadow-xl shadow-black/10 dark:shadow-black/40 z-50 overflow-hidden"
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${conn.classes}`}
                    >
                      {conn.icon}
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-foreground">
                        {conn.label}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {conn.subLabel}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <span
                        className={`font-medium ${connStatus === "live" ? "text-green-500" : connStatus === "offline" ? "text-destructive" : "text-amber-500"}`}
                      >
                        {connStatus.charAt(0).toUpperCase() +
                          connStatus.slice(1)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Events/min</span>
                      <span className="font-medium text-foreground">
                        {eventsPerMin}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Queue Depth</span>
                      <span
                        className={`font-medium ${queuedCount > 0 ? "text-amber-500" : "text-green-500"}`}
                      >
                        {queuedCount}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Activity className="h-3 w-3" />
                      <span>Real-time sync active</span>
                      <CheckCircle2 className="h-3 w-3 text-green-500 ml-auto" />
                    </div>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 min-w-0" />

      {/* Search */}
      <div className="relative">
        <AnimatePresence>
          {searchOpen ? (
            <>
              <div
                className="fixed inset-0 z-40 bg-blue-950/80 sm:hidden"
                onClick={() => setSearchOpen(false)}
              />
              <motion.div
                key="search-open"
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                exit={{ scaleX: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed left-4 right-4 top-3 z-50 origin-right overflow-hidden sm:relative sm:left-auto sm:right-auto sm:top-0 sm:z-auto sm:w-64"
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search devices, alerts…"
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
          </>
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
              <div
                className="fixed inset-0 z-40"
                onClick={closeNotifications}
              />

              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ type: "spring", duration: 0.2, bounce: 0.1 }}
                className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-linear-to-b from-card to-card/80 backdrop-blur-xl border border-border border-t-2 rounded-xl shadow-xl shadow-black/10 dark:shadow-black/40 z-50 overflow-hidden"
                role="dialog"
                aria-label="Notifications"
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeNotifications();
                }}
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
                        aria-label={`${alert.title} from ${alert.device_id}`}
                      >
                        <div
                          className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                            alert.severity === "critical"
                              ? "bg-destructive/15"
                              : alert.severity === "high"
                                ? "bg-orange-500/15"
                                : alert.severity === "medium"
                                  ? "bg-amber-500/15"
                                  : "bg-primary/15"
                          }`}
                        >
                          {alert.severity === "critical" ||
                          alert.severity === "high" ? (
                            <AlertTriangle
                              className={`h-3 w-3 ${
                                alert.severity === "critical"
                                  ? "text-destructive"
                                  : "text-orange-500"
                              }`}
                            />
                          ) : (
                            <MonitorSmartphone
                              className={`h-3 w-3 ${
                                alert.severity === "medium"
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
                            {alert.device_id} ·{" "}
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

      {/* User avatar with dropdown */}
      <div className="relative ml-2">
        <button
          onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
          className="flex items-center gap-2.5 rounded-lg p-1 hover:bg-muted/60 transition-colors"
          aria-label="User menu"
        >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={displayName}
              width={32}
              height={32}
              className="w-8 h-8 rounded-full object-cover shrink-0"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full bg-linear-to-br from-primary to-violet-500 border border-primary/20 flex items-center justify-center shrink-0"
              aria-label={`User: ${displayName}`}
            >
              <span className="text-xs font-bold text-primary">{initials}</span>
            </div>
          )}
          <div className="hidden md:block min-w-0 text-left">
            <p className="text-xs font-medium text-foreground leading-none mb-0.5 truncate">
              {displayName}
            </p>
            <p className="text-[10px] text-muted-foreground leading-none">
              {userRole
                ? userRole.charAt(0).toUpperCase() +
                  userRole.slice(1).toLowerCase()
                : "Analyst"}
            </p>
          </div>
          <ChevronDown className="hidden md:block h-3 w-3 text-muted-foreground" />
        </button>

        <AnimatePresence>
          {avatarMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setAvatarMenuOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ type: "spring", duration: 0.2, bounce: 0.1 }}
                className="absolute right-0 top-full mt-2 w-56 bg-linear-to-b from-card to-card/80 backdrop-blur-xl border border-border border-t-2 rounded-xl shadow-xl shadow-black/10 dark:shadow-black/40 z-50 overflow-hidden"
              >
                <div className="p-2 space-y-0.5">
                  <button
                    onClick={() => {
                      window.location.href = "/dashboard/settings";
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <User className="h-4 w-4 text-muted-foreground" />
                    Profile & Settings
                  </button>
                  {hasMultipleOrgs && (
                    <button
                      onClick={() => {
                        window.location.href = "/onboarding/organizations";
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted/60 transition-colors"
                    >
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      Switch Organization
                    </button>
                  )}
                  <hr className="my-1 border-border" />
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={logoutDialogOpen}
        onOpenChange={setLogoutDialogOpen}
        title="Sign Out"
        description="Are you sure you want to sign out? You'll need to sign in again to access the dashboard."
        confirmLabel="Sign Out"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={confirmLogout}
        loading={logoutLoading}
      />
    </header>
  );
}
