"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  AlertTriangle,
  Info,
  Search,
  Activity,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useLogsStore } from "@/lib/stores/logs-store";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG: Record<
  string,
  { color: string; bg: string; icon: React.ElementType; glow: string }
> = {
  ERROR: {
    color: "text-destructive",
    bg: "bg-destructive/10",
    icon: AlertCircle,
    glow: "shadow-[0_0_8px_#ef4444_inset]",
  },
  WARNING: {
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    icon: AlertTriangle,
    glow: "shadow-[0_0_6px_#f59e0b_inset]",
  },
  INFO: { color: "text-blue-500", bg: "bg-blue-500/10", icon: Info, glow: "" },
};

const SEVERITY_COLORS: Record<string, string> = {
  ERROR: "#ef4444",
  WARNING: "#f59e0b",
  INFO: "#06b6d4",
};

const RESOURCE_COLORS = [
  "#06b6d4",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
];

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-bold text-primary">{payload[0].value} entries</p>
    </div>
  );
}

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="font-bold text-foreground">{payload[0].name}</p>
      <p className="text-muted-foreground">{payload[0].value} entries</p>
    </div>
  );
}

export default function PlatformAuditLogPage() {
  const logs = useLogsStore((s) => s.logs);
  const status = useLogsStore((s) => s.status);
  const searchTerm = useLogsStore((s) => s.searchTerm);
  const setSearchTerm = useLogsStore((s) => s.setSearchTerm);

  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [resourceFilter, setResourceFilter] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    useLogsStore.getState().refreshLogs();
  }, []);

  const resourceTypes = useMemo(() => {
    const types = new Set(logs.map((l) => l.resource_type));
    return Array.from(types).sort();
  }, [logs]);

  const severityData = useMemo(() => {
    const counts = { ERROR: 0, WARNING: 0, INFO: 0 };
    logs.forEach((l) => {
      if (l.severity in counts) counts[l.severity as keyof typeof counts]++;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: SEVERITY_COLORS[name] }));
  }, [logs]);

  const activityData = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86_400_000);
      const key = d.toLocaleDateString("en-US", { weekday: "short" });
      days[key] = 0;
    }
    logs.forEach((l) => {
      const d = new Date(l.timestamp).toLocaleDateString("en-US", {
        weekday: "short",
      });
      if (d in days) days[d]++;
    });
    return Object.entries(days).map(([day, count]) => ({ day, count }));
  }, [logs, now]);

  const resourceData = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((l) => {
      counts[l.resource_type] = (counts[l.resource_type] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, value]) => ({
        name: name.length > 20 ? name.slice(0, 20) + "..." : name,
        value,
      }));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (severityFilter && l.severity !== severityFilter) return false;
      if (resourceFilter && l.resource_type !== resourceFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          l.action.toLowerCase().includes(term) ||
          l.resource_type.toLowerCase().includes(term) ||
          l.severity.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [logs, severityFilter, resourceFilter, searchTerm]);

  const relativeTime = (iso: string) => {
    const diff = now - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    return `${Math.floor(m / 1440)}d ago`;
  };

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-xl lg:text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Platform Audit Log
        </h1>
        <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
          All audit events across every organization
        </p>
      </motion.div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Severity donut */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold text-foreground">
              Severity Distribution
            </h3>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="p-4 h-48 flex items-center gap-3">
            {severityData.length > 0 ? (
              <>
                <div className="flex-1 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={severityData}
                        cx="50%"
                        cy="50%"
                        innerRadius="55%"
                        outerRadius="80%"
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {severityData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {severityData.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center gap-2 text-xs"
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: d.color }}
                      />
                      <span className="text-muted-foreground w-14">
                        {d.name}
                      </span>
                      <span className="font-bold text-foreground">
                        {d.value}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <Shield className="h-8 w-8 text-muted-foreground/20" />
              </div>
            )}
          </div>
        </motion.div>

        {/* Activity timeline */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold text-foreground">
              Activity — Last 7 Days
            </h3>
            <Activity className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="p-4 h-48">
            {activityData.some((d) => d.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={activityData}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="auditAreaGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.25}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#auditAreaGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <Activity className="h-8 w-8 text-muted-foreground/20" />
              </div>
            )}
          </div>
        </motion.div>

        {/* Resource type breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold text-foreground">
              Resource Types
            </h3>
            <Shield className="h-3.5 w-3.5 text-violet-500" />
          </div>
          <div className="p-4 h-48">
            {resourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={resourceData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: "hsl(var(--muted)/0.4)" }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
                    {resourceData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={RESOURCE_COLORS[i % RESOURCE_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <Shield className="h-8 w-8 text-muted-foreground/20" />
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
        className="flex flex-col sm:flex-row gap-3"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by action or resource type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white/3 border-white/10 text-white placeholder:text-slate-500 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
          />
        </div>
        <div className="flex gap-2">
          {[null, "ERROR", "WARNING", "INFO"].map((sev) => (
            <button
              key={sev ?? "all"}
              onClick={() => setSeverityFilter(sev)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                severityFilter === sev
                  ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                  : "bg-white/3 border-white/10 text-slate-400 hover:text-white hover:border-white/20",
              )}
            >
              {sev ?? "All"}
            </button>
          ))}
        </div>
        <select
          value={resourceFilter ?? ""}
          onChange={(e) => setResourceFilter(e.target.value || null)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/3 border border-white/10 text-slate-400 hover:text-white transition-colors outline-none"
        >
          <option value="">All Resources</option>
          {resourceTypes.map((rt) => (
            <option key={rt} value={rt}>
              {rt}
            </option>
          ))}
        </select>
      </motion.div>

      {/* Log entries */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32 }}
        className="bg-card border border-border rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">
              Audit Events
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              {filteredLogs.length}
            </Badge>
          </div>
        </div>

        {status === "loading" ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Shield className="h-8 w-8 text-green-500/30" />
            <p className="text-sm text-muted-foreground">
              No audit entries found
            </p>
            <p className="text-xs text-muted-foreground/60">
              Try adjusting your filters
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            <AnimatePresence>
              {filteredLogs.map((log, i) => {
                const cfg =
                  SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.INFO;
                const Icon = cfg.icon;
                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.008 }}
                    className={cn(
                      "flex items-start gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors",
                      log.severity === "ERROR" && "bg-destructive/2",
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        cfg.bg,
                        log.severity === "ERROR" &&
                          "shadow-[0_0_10px_#ef4444/30]",
                      )}
                    >
                      <Icon className={cn("h-4 w-4", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          {log.action}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] font-mono"
                        >
                          {log.resource_type}
                        </Badge>
                        {log.organization_id && (
                          <Badge
                            variant="outline"
                            className="text-[9px] text-muted-foreground"
                          >
                            {log.organization_id.slice(0, 8)}…
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                            cfg.bg,
                            cfg.color,
                          )}
                        >
                          {log.severity}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {relativeTime(log.timestamp)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );
}
