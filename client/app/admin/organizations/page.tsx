"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Globe,
  Search,
  Building2,
  Users,
  MonitorSmartphone,
  TrendingUp,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAdminStore } from "@/lib/stores/admin-store";
import { cn } from "@/lib/utils";

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      {payload.map((p, i) => (
        <p
          key={i}
          className={
            i === 0 ? "text-foreground font-medium" : "text-muted-foreground"
          }
        >
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

export default function PlatformOrganizationsPage() {
  const organizations = useAdminStore((s) => s.organizations);
  const organizationsLoading = useAdminStore((s) => s.organizationsLoading);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);

  useEffect(() => {
    useAdminStore.getState().fetchOrganizations();
  }, []);

  const filtered = organizations.filter(
    (o) =>
      o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.slug.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const totalDevices = useMemo(
    () => organizations.reduce((s, o) => s + o.device_count, 0),
    [organizations],
  );
  const totalUsers = useMemo(
    () => organizations.reduce((s, o) => s + o.user_count, 0),
    [organizations],
  );
  const maxDevices = useMemo(
    () => Math.max(...organizations.map((o) => o.device_count), 1),
    [organizations],
  );

  const topOrgs = useMemo(() => {
    return [...organizations]
      .sort((a, b) => b.device_count - a.device_count)
      .slice(0, 8)
      .map((o) => ({
        name: o.name.length > 14 ? o.name.slice(0, 14) + "..." : o.name,
        Devices: o.device_count,
        Users: o.user_count,
      }));
  }, [organizations]);

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-xl lg:text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <Globe className="h-6 w-6 text-primary" />
          Organizations
        </h1>
        <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
          Manage all organizations on the platform
        </p>
      </motion.div>

      {/* Summary stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Total Organizations",
            value: organizations.length,
            icon: Building2,
            accent: "text-primary",
            accentBg: "bg-primary/10",
            accentBorder: "border-primary/20",
          },
          {
            label: "Total Devices",
            value: totalDevices,
            icon: MonitorSmartphone,
            accent: "text-emerald-500",
            accentBg: "bg-emerald-500/10",
            accentBorder: "border-emerald-500/20",
          },
          {
            label: "Total Users",
            value: totalUsers,
            icon: Users,
            accent: "text-violet-500",
            accentBg: "bg-violet-500/10",
            accentBorder: "border-violet-500/20",
          },
          {
            label: "Avg Devices / Org",
            value: organizations.length
              ? (totalDevices / organizations.length).toFixed(1)
              : "0",
            icon: TrendingUp,
            accent: "text-sky-500",
            accentBg: "bg-sky-500/10",
            accentBorder: "border-sky-500/20",
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className={cn(
              "bg-card border border-border rounded-2xl p-4 hover:shadow-lg transition-shadow relative overflow-hidden",
              "hover:shadow-black/10 dark:hover:shadow-black/30",
            )}
          >
            <div
              className={cn(
                "absolute -top-6 -right-6 w-20 h-20 rounded-full blur-2xl opacity-50 pointer-events-none",
                stat.accentBg,
              )}
            />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold font-display text-foreground mt-0.5">
                  {organizationsLoading
                    ? "—"
                    : typeof stat.value === "number"
                      ? stat.value.toLocaleString()
                      : stat.value}
                </p>
              </div>
              <div
                className={cn(
                  "w-9 h-9 rounded-lg border flex items-center justify-center",
                  stat.accentBg,
                  stat.accentBorder,
                )}
              >
                <stat.icon className={cn("h-4 w-4", stat.accent)} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search organizations by name or slug..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white/3 border-white/10 text-white placeholder:text-slate-500 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
          />
        </div>
      </motion.div>

      {/* Org list */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24 }}
        className="bg-card border border-border rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              All Organizations
            </h3>
            <Badge variant="outline" className="text-[10px] font-mono">
              {filtered.length}
            </Badge>
          </div>
        </div>

        {organizationsLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Building2 className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              No organizations found
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((org, i) => (
              <motion.div
                key={org.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
              >
                <button
                  onClick={() =>
                    setExpandedOrg(expandedOrg === org.id ? null : org.id)
                  }
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0 grid grid-cols-12 gap-3 items-center">
                    <div className="col-span-3">
                      <p className="text-sm font-medium text-foreground truncate">
                        {org.name}
                      </p>
                      <Badge
                        variant="outline"
                        className="text-[9px] font-mono mt-0.5"
                      >
                        {org.slug}
                      </Badge>
                    </div>
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        <MonitorSmartphone className="h-3 w-3 text-emerald-500 shrink-0" />
                        <span className="text-xs text-muted-foreground shrink-0">
                          {org.device_count}
                        </span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-emerald-500"
                            initial={{ width: 0 }}
                            animate={{
                              width: `${(org.device_count / maxDevices) * 100}%`,
                            }}
                            transition={{ duration: 0.6, delay: i * 0.02 }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-3 w-3 text-violet-500 shrink-0" />
                        <span className="text-xs text-muted-foreground shrink-0">
                          {org.user_count}
                        </span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-violet-500"
                            initial={{ width: 0 }}
                            animate={{
                              width: `${org.user_count > 0 ? Math.min((org.user_count / Math.max(...organizations.map((o) => o.user_count), 1)) * 100, 100) : 0}%`,
                            }}
                            transition={{ duration: 0.6, delay: i * 0.02 }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="text-xs text-muted-foreground">
                        {new Date(org.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {expandedOrg === org.id ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </button>
                {expandedOrg === org.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-5 py-3 bg-muted/20 border-t border-border"
                  >
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Domain</p>
                        <p className="text-sm font-medium text-foreground mt-0.5">
                          {org.domain || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Created</p>
                        <p className="text-sm font-medium text-foreground mt-0.5">
                          {new Date(org.created_at).toLocaleDateString(
                            "en-US",
                            { year: "numeric", month: "long", day: "numeric" },
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Device Density
                        </p>
                        <p className="text-sm font-medium text-foreground mt-0.5">
                          {org.user_count > 0
                            ? (org.device_count / org.user_count).toFixed(2)
                            : "—"}{" "}
                          devices/user
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Device vs User chart */}
      {topOrgs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Devices vs Users
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Top organizations compared
              </p>
            </div>
          </div>
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topOrgs}
                margin={{ top: 4, right: 16, left: -20, bottom: 0 }}
                barGap={2}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
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
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: "hsl(var(--muted)/0.4)" }}
                />
                <Bar
                  dataKey="Devices"
                  fill="#06b6d4"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={14}
                />
                <Bar
                  dataKey="Users"
                  fill="#8b5cf6"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={14}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}
    </div>
  );
}
