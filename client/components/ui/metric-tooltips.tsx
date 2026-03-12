import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricTooltipProps {
  children: React.ReactNode;
  metric: "cpu" | "ram";
  value: number;
  threshold?: number;
  status?: "online" | "offline";
}

export function MetricTooltip({ children, metric, value, threshold = 80, status = "online" }: MetricTooltipProps) {
  const getTooltipContent = () => {
    if (status === "offline") {
      return "Device is offline - no metrics available";
    }

    const isHigh = value > threshold;
    const metricName = metric.toUpperCase();

    return (
      <div className="space-y-2">
        <div className="font-medium">{metricName} Usage</div>
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span>Current:</span>
            <span className={`font-mono ${isHigh ? "text-destructive" : "text-foreground"}`}>
              {value}%
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Threshold:</span>
            <span className="font-mono">{threshold}%</span>
          </div>
        </div>
        {isHigh && (
          <div className="text-xs text-destructive pt-1 border-t border-border">
            ⚠️ High {metricName} usage detected
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {metric === "cpu"
            ? "CPU usage indicates processing load on the device."
            : "RAM usage shows memory consumption and potential pressure."
          }
        </div>
      </div>
    );
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {getTooltipContent()}
      </TooltipContent>
    </Tooltip>
  );
}

interface PerformanceTooltipProps {
  children: React.ReactNode;
  cpu: number;
  ram: number;
  status: "online" | "offline";
  lastSeen?: string;
}

export function PerformanceTooltip({ children, cpu, ram, status, lastSeen }: PerformanceTooltipProps) {
  const getPerformanceLevel = () => {
    if (status === "offline") return { level: "offline", color: "text-muted-foreground", description: "Device offline" };

    const avgUsage = (cpu + ram) / 2;
    if (avgUsage > 80) return { level: "critical", color: "text-destructive", description: "Critical load" };
    if (avgUsage > 60) return { level: "high", color: "text-orange-500", description: "High load" };
    if (avgUsage > 40) return { level: "moderate", color: "text-amber-500", description: "Moderate load" };
    return { level: "optimal", color: "text-green-500", description: "Optimal performance" };
  };

  const performance = getPerformanceLevel();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-2">
          <div className="font-medium">Device Performance</div>
          <div className={`text-sm font-medium ${performance.color}`}>
            {performance.description}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span>CPU:</span>
              <span className="font-mono">{status === "offline" ? "—" : `${cpu}%`}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>RAM:</span>
              <span className="font-mono">{status === "offline" ? "—" : `${ram}%`}</span>
            </div>
          </div>
          {lastSeen && (
            <div className="text-xs text-muted-foreground pt-1 border-t border-border">
              Last seen: {lastSeen}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
