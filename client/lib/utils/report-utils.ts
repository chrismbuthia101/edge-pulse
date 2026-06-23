import type { DateRange } from "@/lib/types/reports";

export const RANGE_OPTS: { label: string; value: DateRange }[] = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "All time", value: "all" },
];

export function cutoffFromDateRange(dateRange: DateRange): Date {
  if (dateRange === "all") return new Date(0);
  const d = new Date();
  const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
  d.setDate(d.getDate() - days);
  return d;
}

export function buildDateBuckets(days: number) {
  const buckets: Record<string, { date: string; count: number }> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    buckets[key] = { date: key, count: 0 };
  }
  return buckets;
}

export const SEV_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#06b6d4",
};

export const STATUS_COLORS: Record<string, string> = {
  PENDING: "#ef4444",
  ACKNOWLEDGED: "#f59e0b",
  INVESTIGATED: "#3b82f6",
  CLOSED: "#22c55e",
};

export const INTEGRITY_COLORS: Record<string, string> = {
  verified: "#22c55e",
  tampered: "#ef4444",
  unknown: "#f59e0b",
  offline: "#6b7280",
};

export const RISK_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#22c55e",
};
