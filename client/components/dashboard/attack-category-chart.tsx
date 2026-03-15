"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Shield, Sword, Wifi, FileText, Cpu, Globe } from "lucide-react";
import { useAlertStore } from "@/stores/alert-store";

// Tooltip components defined outside render to avoid recreation
interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: {
      category: string;
      count: number;
      severity: { critical: number; high: number; medium: number; low: number };
    };
  }>;
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload[0]) {
    const data = payload[0].payload;
    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold text-sm mb-2">{data.category}</p>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Total: {data.count}</p>
          {Object.entries(data.severity).map(([severity, count]) => (
            (count as number) > 0 && (
              <div key={severity} className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] }}
                />
                <span className="text-xs capitalize">{severity}: {count as number}</span>
              </div>
            )
          ))}
        </div>
      </div>
    );
  }
  return null;
};

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
  }>;
}

const PieTooltip = ({ active, payload }: PieTooltipProps) => {
  if (active && payload && payload[0]) {
    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold text-sm">{payload[0].name}</p>
        <p className="text-xs text-muted-foreground">{payload[0].value} attacks</p>
      </div>
    );
  }
  return null;
};

interface CategoryData {
  category: string;
  count: number;
  severity: { critical: number; high: number; medium: number; low: number };
  percentage: number;
}

const CATEGORY_ICONS = {
  Malware: Sword,
  Network: Wifi,
  File: FileText,
  Process: Cpu,
  Auth: Shield,
  Web: Globe,
};

const CATEGORY_COLORS = {
  Malware: "#ef4444",
  Network: "#f97316",
  File: "#eab308",
  Process: "#22c55e",
  Auth: "#3b82f6",
  Web: "#8b5cf6",
};

const SEVERITY_COLORS = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#16a34a",
};

export function AttackCategoryChart() {
  const alerts = useAlertStore((s) => s.alerts);

  const categoryData = useMemo(() => {
    // Group alerts by category
    const grouped = alerts.reduce((acc, alert) => {
      const category = alert.category || "Unknown";
      if (!acc[category]) {
        acc[category] = {
          category,
          count: 0,
          severity: { critical: 0, high: 0, medium: 0, low: 0 },
          percentage: 0,
        };
      }
      acc[category].count++;
      acc[category].severity[alert.severity]++;
      return acc;
    }, {} as Record<string, CategoryData>);

    // Convert to array and calculate percentages
    const total = alerts.length || 1;
    const data = Object.values(grouped).map(item => ({
      ...item,
      percentage: Math.round((item.count / total) * 100),
    }));

    // Sort by count (descending)
    return data.sort((a, b) => b.count - a.count);
  }, [alerts]);

  // Prepare data for pie chart
  const pieData = useMemo(() =>
    categoryData.map(item => ({
      name: item.category,
      value: item.count,
      color: CATEGORY_COLORS[item.category as keyof typeof CATEGORY_COLORS] || "#6b7280",
    })), [categoryData]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden"
    >
      <div className="px-4 lg:px-5 py-3 lg:py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Sword className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Attack Categories</h3>
        </div>
      </div>

      <div className="p-4 lg:p-5">
        {categoryData.length > 0 ? (
          <div className="space-y-6">
            {/* Bar Chart */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-3">By Volume</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 10 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="count"
                    fill="currentColor"
                    className="text-primary"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie Chart and Categories List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie Chart */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-3">Distribution</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Categories List */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-3">Breakdown</h4>
                <div className="space-y-2">
                  {categoryData.slice(0, 6).map((item, index) => {
                    const Icon = CATEGORY_ICONS[item.category as keyof typeof CATEGORY_ICONS] || Shield;
                    const color = CATEGORY_COLORS[item.category as keyof typeof CATEGORY_COLORS] || "#6b7280";

                    return (
                      <motion.div
                        key={item.category}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center gap-3 p-2 rounded-lg bg-background/50"
                      >
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {item.category}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.count} attacks ({item.percentage}%)
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No attack data available</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
