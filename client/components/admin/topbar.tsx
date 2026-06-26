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
import { useAuth } from "@/lib/auth/useAuth";

interface TopBarProps {
  onMobileMenuToggle?: () => void;
}

export function AdminTopBar({ onMobileMenuToggle }: TopBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const { role: userRole, hasMultipleOrganizations: hasMultipleOrgs, signOut } = useAuth();

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
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-xl flex items-center px-4 lg:px-6 gap-2 lg:gap-4 sticky top-0 z-30 dark:border-white/10 dark:bg-[#0a0f1d]/80 shadow-sm shadow-black/5 dark:shadow-black/20">
      <button
        onClick={onMobileMenuToggle}
        className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
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
                className="fixed inset-0 z-40 bg-background/90 sm:hidden"
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
                  placeholder="Search organizations, logs..."
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

      <button
        className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
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
              <div
                className="fixed inset-0 z-40"
                onClick={closeNotifications}
              />

              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-xl shadow-black/10 dark:shadow-black/40 z-50 overflow-hidden"
                role="dialog"
                aria-label="Notifications"
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeNotifications();
                }}
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
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-primary hover:underline"
                  >
                    Mark all read
                  </button>
                </div>

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
                        className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer focus:bg-muted/30 focus:outline-none"
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

      <ThemeToggle />

      <div className="relative ml-2">
        <button
          onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
          className="flex items-center gap-2.5 rounded-lg p-1 hover:bg-muted/40 transition-colors"
          aria-label="User menu"
        >
          <div
            className="w-8 h-8 rounded-full bg-linear-to-br from-primary to-violet-500 border border-primary/20 flex items-center justify-center shrink-0"
            aria-label={`User: ${displayName}`}
          >
            <span className="text-xs font-bold text-primary-foreground">{initials}</span>
          </div>
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
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-56 bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-xl shadow-black/10 dark:shadow-black/40 z-50 overflow-hidden"
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
                    onClick={async () => {
                      await signOut();
                    }}
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
    </header>
  );
}
