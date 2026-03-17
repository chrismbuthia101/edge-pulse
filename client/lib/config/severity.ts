export const severityConfig = {
  critical: {
    label: "Critical",
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/20",
    dot: "bg-destructive",
    pillBg: "bg-destructive/15",
    pillBorder: "border-destructive/30",
  },
  high: {
    label: "High",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    dot: "bg-orange-500",
    pillBg: "bg-orange-500/15",
    pillBorder: "border-orange-500/30",
  },
  medium: {
    label: "Medium",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    dot: "bg-amber-500",
    pillBg: "bg-amber-500/15",
    pillBorder: "border-amber-500/30",
  },
  low: {
    label: "Low",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    dot: "bg-primary",
    pillBg: "bg-primary/15",
    pillBorder: "border-primary/30",
  },
} as const;

export type Severity = keyof typeof severityConfig;

export const riskConfig = {
  critical: { color: "text-destructive", bg: "bg-destructive/10", label: "Critical" },
  high: { color: "text-orange-500", bg: "bg-orange-500/10", label: "High" },
  medium: { color: "text-amber-500", bg: "bg-amber-500/10", label: "Medium" },
  low: { color: "text-primary", bg: "bg-primary/10", label: "Low" },
  none: { color: "text-green-500", bg: "bg-green-500/10", label: "Clean" },
} as const;

export type RiskLevel = keyof typeof riskConfig;