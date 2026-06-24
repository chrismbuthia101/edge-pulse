"use client";

import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Globe,
  Users,
  MonitorSmartphone,
  Activity,
  Shield,
  TrendingUp,
  Building2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAdminStore } from "@/lib/stores/admin-store";
import { cn } from "@/lib/utils";

const COLORS = [
  "#06b6d4",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
];

function BarTooltip({
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
      <p className="font-bold text-primary">{payload[0].value} devices</p>
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
      <p className="text-muted-foreground">{payload[0].value} organizations</p>
    </div>
  );
}

function AreaTooltip({
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
      <p className="font-bold text-primary">{payload[0].value} orgs</p>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
  accentBg,
  accentBorder,
  index,
  loading,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  accent: string;
  accentBg: string;
  accentBorder: string;
  index: number;
  loading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.45, ease: "easeOut" }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      className="bg-card border border-border rounded-2xl p-5 hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30 transition-shadow relative overflow-hidden"
    >
      <div
        className={cn(
          "absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-60 pointer-events-none",
          accentBg,
        )}
      />
      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div
            className={cn(
              "w-10 h-10 rounded-xl border flex items-center justify-center",
              accentBg,
              accentBorder,
            )}
          >
            <Icon className={cn("h-5 w-5", accent)} />
          </div>
          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary">
            <TrendingUp className="h-3 w-3" />
            {subtitle}
          </span>
        </div>
        <p className="text-2xl font-bold font-display text-foreground mb-0.5">
          {loading ? "—" : value}
        </p>
        <p className="text-xs text-muted-foreground">{title}</p>
      </div>
    </motion.div>
  );
}

export default function PlatformOverviewPage() {
  const overview = useAdminStore((s) => s.overview);
  const overviewLoading = useAdminStore((s) => s.overviewLoading);
  const organizations = useAdminStore((s) => s.organizations);
  const organizationsLoading = useAdminStore((s) => s.organizationsLoading);

  useEffect(() => {
    useAdminStore.getState().fetchOverview();
    useAdminStore.getState().fetchOrganizations();
  }, []);

  const loading_ = overviewLoading || organizationsLoading;

  const topOrgs = useMemo(() => {
    return [...organizations]
      .sort((a, b) => b.device_count - a.device_count)
      .slice(0, 10)
      .map((o) => ({
        name: o.name.length > 16 ? o.name.slice(0, 16) + "..." : o.name,
        devices: o.device_count,
        users: o.user_count,
      }));
  }, [organizations]);

  const orgSizeData = useMemo(() => {
    const tiers = { Small: 0, Medium: 0, Large: 0 };
    organizations.forEach((o) => {
      if (o.device_count >= 50) tiers.Large++;
      else if (o.device_count >= 10) tiers.Medium++;
      else tiers.Small++;
    });
    return [
      { name: "Small (<10)", value: tiers.Small, color: "#06b6d4" },
      { name: "Medium (10-50)", value: tiers.Medium, color: "#f59e0b" },
      { name: "Large (50+)", value: tiers.Large, color: "#ef4444" },
    ].filter((d) => d.value > 0);
  }, [organizations]);

  const orgGrowth = useMemo(() => {
    const months: Record<string, number> = {};
    organizations.forEach((o) => {
      const d = new Date(o.created_at);
      const key = d.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
      months[key] = (months[key] || 0) + 1;
    });
    const sorted = Object.entries(months).sort(([a], [b]) => {
      const da = new Date(a);
      const db = new Date(b);
      return da.getTime() - db.getTime();
    });
    return sorted.map(([label, count]) => ({ label, count }));
  }, [organizations]);

  const stats = [
    {
      title: "Organizations",
      value: (overview?.total_orgs ?? 0).toLocaleString(),
      subtitle: "total registered",
      icon: Building2,
      accent: "text-primary",
      accentBg: "bg-primary/10",
      accentBorder: "border-primary/20",
    },
    {
      title: "Total Users",
      value: (overview?.total_users ?? 0).toLocaleString(),
      subtitle: "across all orgs",
      icon: Users,
      accent: "text-violet-500",
      accentBg: "bg-violet-500/10",
      accentBorder: "border-violet-500/20",
    },
    {
      title: "Devices",
      value: (overview?.total_devices ?? 0).toLocaleString(),
      subtitle: "enrolled",
      icon: MonitorSmartphone,
      accent: "text-emerald-500",
      accentBg: "bg-emerald-500/10",
      accentBorder: "border-emerald-500/20",
    },
    {
      title: "Total Alerts",
      value: (overview?.total_alerts ?? 0).toLocaleString(),
      subtitle: "all time",
      icon: Activity,
      accent: "text-amber-500",
      accentBg: "bg-amber-500/10",
      accentBorder: "border-amber-500/20",
    },
    {
      title: "Avg Devices / Org",
      value: overview?.total_orgs
        ? (overview.total_devices / overview.total_orgs).toFixed(1)
        : "0",
      subtitle: "platform average",
      icon: MonitorSmartphone,
      accent: "text-sky-500",
      accentBg: "bg-sky-500/10",
      accentBorder: "border-sky-500/20",
    },
    {
      title: "Avg Users / Org",
      value: overview?.total_orgs
        ? (overview.total_users / overview.total_orgs).toFixed(1)
        : "0",
      subtitle: "platform average",
      icon: Users,
      accent: "text-pink-500",
      accentBg: "bg-pink-500/10",
      accentBorder: "border-pink-500/20",
    },
  ];

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      >
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Platform Overview
          </h1>
          <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
            Cross-organization platform metrics
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 lg:gap-4">
        {stats.map((stat, i) => (
          <StatCard key={stat.title} {...stat} index={i} loading={loading_} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Top Orgs by Devices */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Top Organizations by Devices
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {organizations.length} total organizations
              </p>
            </div>
            <MonitorSmartphone className="h-4 w-4 text-primary" />
          </div>
          <div className="p-4 h-64">
            {topOrgs.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topOrgs}
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
                    width={80}
                  />
                  <Tooltip content={<BarTooltip />} />
                  <Bar
                    dataKey="devices"
                    name="Devices"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={18}
                  >
                    {topOrgs.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2">
                <MonitorSmartphone className="h-8 w-8 text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground">
                  No organization data
                </p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Org Size Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Organization Size Distribution
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                By device count tiers
              </p>
            </div>
            <Globe className="h-4 w-4 text-violet-500" />
          </div>
          <div className="p-4 h-64 flex items-center gap-4">
            {orgSizeData.length > 0 ? (
              <>
                <div className="flex-1 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={orgSizeData}
                        cx="50%"
                        cy="50%"
                        innerRadius="50%"
                        outerRadius="80%"
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {orgSizeData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {orgSizeData.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center gap-2 text-xs"
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: d.color }}
                      />
                      <span className="text-muted-foreground w-24">
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
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <Globe className="h-8 w-8 text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground">No data</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Org Growth Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36 }}
        className="bg-card border border-border rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Organization Growth
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Orgs created per month
            </p>
          </div>
          <TrendingUp className="h-4 w-4 text-emerald-500" />
        </div>
        <div className="p-4 h-52">
          {orgGrowth.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={orgGrowth}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="orgAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.3}
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
                  dataKey="label"
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
                <Tooltip content={<AreaTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#orgAreaGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-2">
              <TrendingUp className="h-8 w-8 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground">No growth data</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
