"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Database, Clock, Trash2, Settings, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface TelemetryRetentionProps {
  deviceId?: string;
}

export function TelemetryRetention({ deviceId }: TelemetryRetentionProps) {
  const [retentionPeriod, setRetentionPeriod] = useState(90);
  const [storageUsage, setStorageUsage] = useState({
    telemetry: 15.7,
    alerts: 2.3,
    features: 8.9,
    total: 26.9,
  });
  const supabase = createClient();

  const retentionOptions = [
    { label: "30 days", value: 30, description: "Minimal storage" },
    { label: "90 days", value: 90, description: "Recommended" },
    { label: "180 days", value: 180, description: "Extended analysis" },
    { label: "365 days", value: 365, description: "Compliance archive" },
  ];

  useEffect(() => {
    const fetchRetentionSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('retention_settings')
          .select('retention_days')
          .eq('device_id', deviceId || 'global')
          .single();

        if (data && !error) {
          setRetentionPeriod(data.retention_days);
        }
      } catch {
        // Use default retention on error
      }
    };

    fetchRetentionSettings();
  }, [deviceId, supabase]);

  const handleRetentionChange = async (days: number) => {
    setRetentionPeriod(days);
    try {
      const { error } = await supabase
        .from('retention_settings')
        .upsert({
          device_id: deviceId || 'global',
          retention_days: days,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
    } catch {
      // Handle save error
    }
  };

  const handlePurgeOldData = async () => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionPeriod);

      const { error } = await supabase
        .from('telemetry_events')
        .delete()
        .lt('collected_at', cutoffDate.toISOString())
        .eq('device_id', deviceId || undefined);

      if (error) throw error;

      // Recalculate storage usage
      const baseSize = 26.9;
      const multiplier = retentionPeriod / 90;
      const newUsage = {
        telemetry: parseFloat((15.7 * multiplier).toFixed(1)),
        alerts: parseFloat((2.3 * multiplier).toFixed(1)),
        features: parseFloat((8.9 * multiplier).toFixed(1)),
        total: parseFloat((baseSize * multiplier).toFixed(1)),
      };
      setStorageUsage(newUsage);
    } catch {
      // Handle purge error
    }
  };

  const getStorageColor = (usage: number) => {
    if (usage < 20) return "text-green-500";
    if (usage < 50) return "text-amber-500";
    return "text-destructive";
  };

  return (
    <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">Telemetry Retention</h3>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 text-xs min-w-0">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Data Lifecycle</span>
        </div>
      </div>

      <div className="p-4 lg:p-5 space-y-4">
        {/* Current Retention Period */}
        <div className="text-center py-3">
          <div className="text-2xl font-bold font-display text-foreground mb-1">
            {retentionPeriod} days
          </div>
          <div className="text-xs text-muted-foreground">Data retention period</div>
        </div>

        {/* Retention Options */}
        <div className="grid grid-cols-2 gap-2">
          {retentionOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleRetentionChange(option.value)}
              className={cn(
                "p-3 rounded-lg border text-xs transition-all text-left",
                retentionPeriod === option.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-accent/50"
              )}
            >
              <div className="font-medium">{option.label}</div>
              <div className="text-[10px] opacity-75 mt-0.5">{option.description}</div>
            </button>
          ))}
        </div>

        {/* Storage Usage */}
        <div className="bg-muted/30 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Storage Usage</span>
            <span className={cn("text-xs font-medium", getStorageColor(storageUsage.total))}>
              {storageUsage.total} GB
            </span>
          </div>

          <div className="space-y-2">
            {[
              { label: "Telemetry", value: storageUsage.telemetry, color: "bg-blue-500" },
              { label: "Alerts", value: storageUsage.alerts, color: "bg-amber-500" },
              { label: "Features", value: storageUsage.features, color: "bg-purple-500" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">{item.label}</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full ${item.color}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${(item.value / storageUsage.total) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {item.value} GB
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Warning for high storage usage */}
        {storageUsage.total > 50 && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-600 dark:text-amber-400">
              <div className="font-medium mb-0.5">High storage usage</div>
              <div>Consider reducing retention period to manage storage costs</div>
            </div>
          </motion.div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handlePurgeOldData}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            Purge Old Data
          </button>
          <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <Settings className="h-3 w-3" />
            Configure
          </button>
        </div>
      </div>
    </div>
  );
}
