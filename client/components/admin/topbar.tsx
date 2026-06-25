"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Command,
  Search,
  ChevronDown,
  Building2,
  LogOut,
  User,
  Shield,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DynamicBreadcrumb } from "@/components/dashboard/dynamic-breadcrumb";
import { useNotifications } from "@/lib/hooks/use-notifications";
import { useAuthStore } from "@/lib/stores/auth-store";

interface TopBarProps {
  onMobileMenuToggle?: () => void;
}

export function AdminTopBar({ onMobileMenuToggle }: TopBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const userRole = useAuthStore((s) => s.user?.role);
  const hasMultipleOrgs = useAuthStore((s) => s.hasMultipleOrganizations());
  const signOut = useAuthStore((s) => s.signOut);

  const {
    initials,
    displayName,

    notifOpen,
    toggleNotifications,
    closeNotifications,
    recentNotifs,
    unreadCount,
    handleMarkAllRead,
    handleNotificationClick,
    handleNotificationKeyDown,
    handleViewAllNotifications,
  } = useNotifications();

  return (
    <header className="h-16 border-b border-white/10 bg-[#0a0f1d]/80 backdrop-blur-xl flex items-center px-4 lg:px-6 gap-2 lg:gap-4 sticky top-0 z-30">
      <button
        onClick={onMobileMenuToggle}
        className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
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

      <div className="flex-1 min-w-0" />

      <div className="relative">
        <AnimatePresence>
          {searchOpen ? (
            <>
              <div
                className="fixed inset-0 z-40 bg-[#020617]/90 sm:hidden"
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <Input
                  autoFocus
                  placeholder="Search organizations, logs..."
                  className="pl-9 pr-8 h-9 text-sm w-full sm:w-64 bg-white/3 border-white/10 text-white placeholder:text-slate-500 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setSearchOpen(false);
                  }}
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
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
              className="h-9 w-9 text-slate-400 hover:text-white hover:bg-white/5"
              onClick={() => setSearchOpen(true)}
              aria-label="Open search"
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
        </AnimatePresence>
      </div>

      <button
        className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/3 text-xs text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
        aria-label="Open command palette (Press K)"
        type="button"
      >
        <Command className="h-3 w-3" aria-hidden="true" />
        <span>K</span>
      </button>

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 relative text-slate-400 hover:text-white hover:bg-white/5"
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
              <div
                className="fixed inset-0 z-40"
                onClick={closeNotifications}
              />

              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#0a0f1d]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-xl shadow-black/40 z-50 overflow-hidden"
                role="dialog"
                aria-label="Notifications"
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeNotifications();
                }}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <span className="text-sm font-semibold text-white">
                    Notifications
                    {unreadCount > 0 && (
                      <span className="ml-2 text-xs font-bold text-red-400">
                        ({unreadCount})
                      </span>
                    )}
                  </span>
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-cyan-400 hover:underline"
                  >
                    Mark all read
                  </button>
                </div>

                <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
                  {recentNotifs.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-slate-400">
                      No notifications
                    </div>
                  ) : (
                    recentNotifs.map((alert, index) => (
                      <div
                        key={alert.id}
                        data-notif-item={index}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-white/3 transition-colors cursor-pointer focus:bg-white/3 focus:outline-none"
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
                            <Shield
                              className={`h-3 w-3 ${
                                alert.severity === "critical"
                                  ? "text-destructive"
                                  : "text-orange-500"
                              }`}
                            />
                          ) : (
                            <Shield
                              className={`h-3 w-3 ${
                                alert.severity === "medium"
                                  ? "text-amber-500"
                                  : "text-primary"
                              }`}
                            />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">
                            {alert.title}
                          </p>
                          <p className="text-xs text-slate-400">
                            {alert.device_id} ·{" "}
                            {new Date(alert.created_at).toLocaleTimeString()}
                          </p>
                        </div>

                        {!alert.read && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 mt-1.5"
                            aria-label="Unread"
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="px-4 py-2.5 border-t border-white/10">
                  <button
                    className="text-xs text-cyan-400 hover:underline w-full text-center"
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

      <ThemeToggle />

      <div className="relative ml-2">
        <button
          onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
          className="flex items-center gap-2.5 rounded-lg p-1 hover:bg-white/5 transition-colors"
          aria-label="User menu"
        >
          <div
            className="w-8 h-8 rounded-full bg-linear-to-br from-cyan-400 to-blue-600 border border-cyan-500/20 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/20"
            aria-label={`User: ${displayName}`}
          >
            <span className="text-xs font-bold text-white">{initials}</span>
          </div>
          <div className="hidden md:block min-w-0 text-left">
            <p className="text-xs font-medium text-white leading-none mb-0.5 truncate">
              {displayName}
            </p>
            <p className="text-[10px] text-slate-400 leading-none">
              {userRole
                ? userRole.charAt(0).toUpperCase() +
                  userRole.slice(1).toLowerCase()
                : "Analyst"}
            </p>
          </div>
          <ChevronDown className="hidden md:block h-3 w-3 text-slate-400" />
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
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-56 bg-[#0a0f1d]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-xl shadow-black/40 z-50 overflow-hidden"
              >
                <div className="p-2 space-y-0.5">
                  <button
                    onClick={() => {
                      window.location.href = "/dashboard/settings";
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white hover:bg-white/5 transition-colors"
                  >
                    <User className="h-4 w-4 text-slate-400" />
                    Profile & Settings
                  </button>
                  {hasMultipleOrgs && (
                    <button
                      onClick={() => {
                        window.location.href = "/onboarding/organizations";
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white hover:bg-white/5 transition-colors"
                    >
                      <Building2 className="h-4 w-4 text-slate-400" />
                      Switch Organization
                    </button>
                  )}
                  <hr className="my-1 border-white/10" />
                  <button
                    onClick={async () => {
                      await signOut();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
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
    </header>
  );
}
