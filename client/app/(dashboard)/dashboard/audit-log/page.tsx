"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  AlertTriangle,
  Info,
  Search,
  Clock,
  User,
  Globe,
  Activity,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useLogsStore } from "@/lib/stores/logs-store";

const severityStyles: Record<
  string,
  { icon: typeof Shield; color: string; bg: string; label: string }
> = {
  ERROR: {
    icon: AlertTriangle,
    color: "text-destructive",
    bg: "bg-destructive/10",
    label: "Error",
  },
  WARNING: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    label: "Warning",
  },
  INFO: {
    icon: Info,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    label: "Info",
  },
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );
}

export default function AuditLogPage() {
  useEffect(() => {
    document.title = "Audit Log - EdgePulse";
  }, []);

  const logs = useLogsStore((s) => s.logs);
  const status = useLogsStore((s) => s.status);
  const searchTerm = useLogsStore((s) => s.searchTerm);
  const setSearchTerm = useLogsStore((s) => s.setSearchTerm);

  const [severityFilter, setSeverityFilter] = useState<string>("all");

  useEffect(() => {
    useLogsStore.getState().refreshLogs({
      orderBy: { column: "timestamp", ascending: false },
      limit: 200,
    });
  }, []);

  const filtered = logs.filter((log) => {
    if (severityFilter !== "all" && log.severity !== severityFilter)
      return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(term) ||
      log.resource_type.toLowerCase().includes(term) ||
      log.severity.toLowerCase().includes(term) ||
      (log.user_id && log.user_id.toLowerCase().includes(term))
    );
  });

  const loading = status === "loading";

  return (
    <div className="max-w-275 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-display font-bold text-foreground">
          Audit Log
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Track all system events and user actions
        </p>
      </motion.div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search audit log..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground ml-2" />
          {["all", "ERROR", "WARNING", "INFO"].map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium capitalize transition-all",
                severityFilter === s
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "all" ? "All" : s.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3 animate-pulse" />
            <p className="text-sm text-muted-foreground">
              Loading audit log...
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Action
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Resource
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    User
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Severity
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    IP Address
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-20 text-center text-sm text-muted-foreground"
                    >
                      <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                      No audit log entries found
                    </td>
                  </tr>
                ) : (
                  filtered.map((log) => {
                    const sev =
                      severityStyles[log.severity] ?? severityStyles.INFO;
                    const SevIcon = sev.icon;
                    return (
                      <tr
                        key={log.id}
                        className="border-b border-border hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            <span className="font-mono text-xs">
                              {formatTimestamp(log.timestamp)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-foreground">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">
                              {log.resource_type}
                            </span>
                            {log.resource_id && (
                              <span className="text-xs font-mono text-muted-foreground/60">
                                #{log.resource_id.slice(0, 8)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-mono text-xs text-muted-foreground">
                              {log.user_id
                                ? log.user_id.slice(0, 8) + "..."
                                : "system"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                              sev.bg,
                              sev.color,
                            )}
                          >
                            <SevIcon className="h-3 w-3" />
                            {sev.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-muted-foreground">
                            {log.ip_address ?? "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filtered.length} of {logs.length} entries
        </p>
      )}
    </div>
  );
}
