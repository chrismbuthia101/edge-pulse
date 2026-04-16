"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Sliders, AlertTriangle, Shield, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThresholdStore } from "@/stores/threshold-store";

interface DetectionThresholdSliderProps {
  deviceId?: string;
}

export function DetectionThresholdSlider({ deviceId }: DetectionThresholdSliderProps) {
  const { threshold, loading, initialize, updateThreshold } = useThresholdStore();
  const [modelStats, setModelStats] = useState({
    precision: 0.92,
    recall: 0.88,
    falsePositives: 12,
    falseNegatives: 23,
    totalAlerts: 156,
  });

  const thresholdPresets = [
    { label: "High Sensitivity", value: 0.5, description: "Catch more anomalies, more false positives" },
    { label: "Balanced", value: 0.75, description: "Recommended for most environments" },
    { label: "High Precision", value: 0.9, description: "Fewer false positives, may miss some anomalies" },
  ];

  useEffect(() => {
    if (deviceId) {
      initialize(deviceId);
    }
  }, [deviceId, initialize]);

  useEffect(() => {
    // Simulate model stats based on threshold
    const newStats = {
      precision: Math.min(0.99, 0.7 + (threshold * 0.3)),
      recall: Math.max(0.6, 0.95 - (threshold * 0.4)),
      falsePositives: Math.max(1, Math.round(50 * (1 - threshold))),
      falseNegatives: Math.max(1, Math.round(30 * threshold)),
      totalAlerts: Math.round(200 * (1.5 - threshold)),
    };
    // Use setTimeout to avoid synchronous setState in effect
    const timer = setTimeout(() => setModelStats(newStats), 0);
    return () => clearTimeout(timer);
  }, [threshold]);

  const getRiskLevel = (value: number) => {
    if (value < 0.6) return { label: "Low", color: "text-green-500" };
    if (value < 0.8) return { label: "Medium", color: "text-amber-500" };
    return { label: "High", color: "text-destructive" };
  };

  const handleThresholdChange = async (value: number) => {
    await updateThreshold(deviceId, value);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sliders className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">Detection Threshold</h3>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 text-xs min-w-0">
          <Shield className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">ML Sensitivity</span>
        </div>
      </div>

      <div className="p-4 lg:p-5 space-y-4">
        {/* Current Threshold Display */}
        <div className="text-center py-4">
          <div className="text-3xl font-bold font-display text-foreground mb-2">
            {(threshold * 100).toFixed(0)}%
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-muted-foreground">Sensitivity</span>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full bg-muted", getRiskLevel(threshold).color)}>
              {getRiskLevel(threshold).label} Risk
            </span>
          </div>
        </div>

        {/* Threshold Slider */}
        <div className="space-y-2">
          <div className="relative">
            <input
              type="range"
              min="0.1"
              max="0.95"
              step="0.05"
              value={threshold}
              onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer slider"
              style={{
                background: `linear-gradient(to right, rgb(34 197 94) 0%, rgb(34 197 94) ${threshold * 100}%, rgb(229 231 235) ${threshold * 100}%, rgb(229 231 235) 100%)`
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>More Sensitive</span>
            <span>More Precise</span>
          </div>
        </div>

        {/* Preset Buttons */}
        <div className="grid grid-cols-3 gap-2">
          {thresholdPresets.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handleThresholdChange(preset.value)}
              className={cn(
                "p-2 rounded-lg border text-xs transition-all",
                Math.abs(threshold - preset.value) < 0.05
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-accent/50"
              )}
            >
              <div className="font-medium">{preset.label}</div>
              <div className="text-[10px] opacity-75 mt-0.5">{(preset.value * 100).toFixed(0)}%</div>
            </button>
          ))}
        </div>

        {/* Impact Stats */}
        <div className="bg-muted/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Model Performance Impact</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-muted-foreground">Precision</span>
                <span className="font-medium text-foreground">{(modelStats.precision * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-green-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${modelStats.precision * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-muted-foreground">Recall</span>
                <span className="font-medium text-foreground">{(modelStats.recall * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-blue-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${modelStats.recall * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              <span className="text-xs text-muted-foreground">Expected alerts/day</span>
            </div>
            <span className="text-xs font-medium text-foreground">{modelStats.totalAlerts}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
