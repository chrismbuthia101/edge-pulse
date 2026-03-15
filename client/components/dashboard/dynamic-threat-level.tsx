"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Shield, ShieldAlert, ShieldX, Activity } from "lucide-react";
import { useAlertStore } from "@/stores/alert-store";
import { useDeviceStore } from "@/stores/device-store";

interface ThreatLevel {
  level: "low" | "medium" | "high" | "critical";
  score: number;
  trend: "rising" | "stable" | "falling";
  activeThreats: number;
  criticalDevices: number;
  recommendation: string;
}

export function DynamicThreatLevel() {
  const alerts = useAlertStore((s) => s.alerts);
  const devices = useDeviceStore((s) => s.devices);

  const threatLevel: ThreatLevel = useMemo(() => {
    // Get recent alerts from last 24 hours
    const now = new Date().getTime();
    const recentAlerts = alerts.filter(
      (a) => now - new Date(a.created_at).getTime() < 24 * 60 * 60 * 1000
    );

    // Get alerts from previous 24 hours for trend calculation
    const previousAlerts = alerts.filter(
      (a) => {
        const alertTime = new Date(a.created_at).getTime();
        const diff = now - alertTime;
        return diff >= 24 * 60 * 60 * 1000 && diff < 48 * 60 * 60 * 1000;
      }
    );

    // Calculate weighted score based on severity
    const severityWeights = { critical: 4, high: 3, medium: 2, low: 1 };
    const currentScore = recentAlerts.reduce(
      (sum, alert) => sum + severityWeights[alert.severity],
      0
    );
    const previousScore = previousAlerts.reduce(
      (sum, alert) => sum + severityWeights[alert.severity],
      0
    );

    // Normalize score (0-100)
    const normalizedScore = Math.min((currentScore / 20) * 100, 100);

    // Determine trend
    let trend: "rising" | "stable" | "falling";
    const scoreDiff = currentScore - previousScore;
    if (scoreDiff > 2) trend = "rising";
    else if (scoreDiff < -2) trend = "falling";
    else trend = "stable";

    // Determine threat level
    let level: "low" | "medium" | "high" | "critical";
    if (normalizedScore >= 75) level = "critical";
    else if (normalizedScore >= 50) level = "high";
    else if (normalizedScore >= 25) level = "medium";
    else level = "low";

    // Count critical devices
    const criticalDevices = devices.filter(
      (d) => d.risk === "critical" || d.status === "gone_silent"
    ).length;

    // Generate recommendation
    let recommendation: string;
    switch (level) {
      case "critical":
        recommendation = "Immediate investigation required. Multiple critical threats detected.";
        break;
      case "high":
        recommendation = "Elevated threat level. Monitor closely and consider proactive measures.";
        break;
      case "medium":
        recommendation = "Moderate threat activity. Continue normal monitoring.";
        break;
      case "low":
        recommendation = "Low threat level. Systems operating within normal parameters.";
        break;
    }

    return {
      level,
      score: Math.round(normalizedScore),
      trend,
      activeThreats: recentAlerts.length,
      criticalDevices,
      recommendation,
    };
  }, [alerts, devices]);

  const getThreatColors = (level: string) => {
    switch (level) {
      case "critical":
        return {
          bg: "bg-destructive/10",
          border: "border-destructive/20",
          text: "text-destructive",
          icon: ShieldX,
        };
      case "high":
        return {
          bg: "bg-orange-500/10",
          border: "border-orange-500/20",
          text: "text-orange-500",
          icon: ShieldAlert,
        };
      case "medium":
        return {
          bg: "bg-yellow-500/10",
          border: "border-yellow-500/20",
          text: "text-yellow-500",
          icon: Shield,
        };
      default:
        return {
          bg: "bg-green-500/10",
          border: "border-green-500/20",
          text: "text-green-500",
          icon: Shield,
        };
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "rising":
        return "↗";
      case "falling":
        return "↘";
      default:
        return "→";
    }
  };

  const colors = getThreatColors(threatLevel.level);
  const Icon = colors.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`bg-card border border-border rounded-xl lg:rounded-2xl p-4 lg:p-5 ${colors.bg} ${colors.border}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-8 lg:w-10 h-8 lg:h-10 rounded-xl border flex items-center justify-center ${colors.bg} ${colors.border}`}>
            <Icon className={`h-4 lg:h-5 w-4 lg:w-5 ${colors.text}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Threat Level</h3>
            <p className="text-xs text-muted-foreground">Real-time assessment</p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1">
            <span className={`text-lg lg:text-xl font-bold font-display capitalize ${colors.text}`}>
              {threatLevel.level}
            </span>
            <span className="text-sm text-muted-foreground">
              {getTrendIcon(threatLevel.trend)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Score: {threatLevel.score}/100
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Progress bar */}
        <div className="relative">
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <motion.div
              className={`h-full rounded-full transition-all duration-500 ${threatLevel.level === "critical"
                  ? "bg-destructive"
                  : threatLevel.level === "high"
                    ? "bg-orange-500"
                    : threatLevel.level === "medium"
                      ? "bg-yellow-500"
                      : "bg-green-500"
                }`}
              initial={{ width: 0 }}
              animate={{ width: `${threatLevel.score}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-2 bg-background/50 rounded-lg">
            <p className="text-sm font-bold text-foreground">
              {threatLevel.activeThreats}
            </p>
            <p className="text-xs text-muted-foreground">Active Threats</p>
          </div>
          <div className="text-center p-2 bg-background/50 rounded-lg">
            <p className="text-sm font-bold text-foreground">
              {threatLevel.criticalDevices}
            </p>
            <p className="text-xs text-muted-foreground">Critical Devices</p>
          </div>
        </div>

        {/* Recommendation */}
        <div className="p-3 bg-background/50 rounded-lg border-l-4 border-current">
          <div className="flex items-start gap-2">
            <Activity className={`h-4 w-4 ${colors.text} mt-0.5 shrink-0`} />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {threatLevel.recommendation}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
