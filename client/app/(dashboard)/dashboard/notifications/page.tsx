"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  AlertTriangle,
  Shield,
  Lock,
  CheckCheck,
  Trash2,
  Settings,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationRepository } from "@/lib/repositories";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { NotificationRow } from "@/lib/supabase/types/database";

type NotifFilter = "all" | "unread" | "critical" | "info";

const severityConfig: Record<
  string,
  { icon: typeof AlertTriangle; color: string; bg: string }
> = {
  critical: {
    icon: AlertTriangle,
    color: "text-destructive",
    bg: "bg-destructive/10 border-destructive/20",
  },
  high: {
    icon: AlertTriangle,
    color: "text-orange-500",
    bg: "bg-orange-500/10 border-orange-500/20",
  },
  medium: {
    icon: Lock,
    color: "text-amber-500",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  low: {
    icon: Shield,
    color: "text-primary",
    bg: "bg-primary/10 border-primary/20",
  },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationsPage() {
  useEffect(() => {
    document.title = "Notifications - EdgePulse";
  }, []);

  const authUser = useAuthStore((s) => s.user);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<NotifFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const loadNotifications = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    setError(null);
    try {
      const repo = new NotificationRepository();
      const data = await repo.findNotifications({
        userId: authUser.id,
        orderBy: { column: "created_at", ascending: false },
        limit: 100,
      });
      setNotifications(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load notifications",
      );
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markAllRead = async () => {
    if (!authUser) return;
    try {
      const repo = new NotificationRepository();
      await repo.markAllAsRead(authUser.id, "");
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          read: true,
          read_at: new Date().toISOString(),
        })),
      );
    } catch {
      // silently handle
    }
  };

  const markRead = async (id: string) => {
    try {
      const repo = new NotificationRepository();
      await repo.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, read: true, read_at: new Date().toISOString() }
            : n,
        ),
      );
    } catch {
      // silently handle
    }
  };

  const dismiss = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      const repo = new NotificationRepository();
      await repo.delete(id);
    } catch {
      loadNotifications();
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "critical") return n.severity === "critical";
    if (filter === "info")
      return n.severity === "low" || n.severity === "medium";
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="max-w-225 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-display font-bold text-foreground">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30">
                {unreadCount} new
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Security alerts and system notifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={markAllRead}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => {
              setNotifications([]);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Settings className="h-3.5 w-3.5" />
            Preferences
          </Button>
        </div>
      </motion.div>

      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5 w-fit">
        <Filter className="h-3.5 w-3.5 text-muted-foreground ml-2" />
        {(["all", "unread", "critical", "info"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium capitalize transition-all",
              filter === f
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f}
            {f === "unread" && unreadCount > 0 && (
              <span className="ml-1 text-[10px] font-bold text-destructive">
                ({unreadCount})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="py-20 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3 animate-pulse" />
            <p className="text-sm text-muted-foreground">
              Loading notifications...
            </p>
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={loadNotifications}
              className="text-sm text-primary mt-2 underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map((notif, i) => {
              const config =
                severityConfig[notif.severity] ?? severityConfig.low;
              const Icon = config.icon;
              return (
                <motion.div
                  key={notif.id}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                  className={cn(
                    "group flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                    notif.read
                      ? "bg-card border-border"
                      : "bg-primary/3 border-primary/20",
                  )}
                  onClick={() => markRead(notif.id)}
                >
                  <div
                    className={`mt-0.5 w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${config.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p
                            className={cn(
                              "text-sm font-semibold",
                              notif.read
                                ? "text-foreground"
                                : "text-foreground",
                            )}
                          >
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                          {notif.message}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{notif.category}</span>
                          <span>·</span>
                          <span>{timeAgo(notif.created_at)}</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(notif.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-md hover:bg-muted flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        {!loading && filtered.length === 0 && (
          <div className="py-20 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No notifications here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
