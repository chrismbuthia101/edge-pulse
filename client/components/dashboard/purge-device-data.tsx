"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Trash2, AlertTriangle, Shield, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface PurgeDeviceDataProps {
  deviceId?: string;
}

export function PurgeDeviceData({ deviceId }: PurgeDeviceDataProps) {
  const [selectedDevice, setSelectedDevice] = useState(deviceId || "");
  const [purgeType, setPurgeType] = useState<"telemetry" | "alerts" | "all">("telemetry");
  const [timeRange, setTimeRange] = useState("older-than-90");
  const [confirming, setConfirming] = useState(false);
  const [purging, setPurging] = useState(false);
  const supabase = createClient();

  const devices = [
    { id: "device-1", name: "Server-01", lastSeen: "2 minutes ago", risk: "high" },
    { id: "device-2", name: "Workstation-05", lastSeen: "1 hour ago", risk: "medium" },
    { id: "device-3", name: "Laptop-12", lastSeen: "3 days ago", risk: "low" },
  ];

  const handlePurge = async () => {
    setPurging(true);
    try {
      const cutoffDate = getCutoffDate();

      if (purgeType === 'telemetry') {
        const { error } = await supabase
          .from('telemetry_events')
          .delete()
          .lt('created_at', cutoffDate)
          .eq('device_id', selectedDevice || undefined);
        if (error) throw error;
      } else if (purgeType === 'alerts') {
        const { error } = await supabase
          .from('alert_records')
          .delete()
          .lt('created_at', cutoffDate)
          .eq('device_id', selectedDevice || undefined);
        if (error) throw error;
      } else {
        // Purge all data for device
        const tables = ['telemetry_events', 'alert_records', 'feature_vectors', 'tamper_evident_log'];
        for (const table of tables) {
          const { error } = await supabase
            .from(table)
            .delete()
            .eq('device_id', selectedDevice);
          if (error) throw error;
        }
      }
    } catch {
      // Handle purge error
    } finally {
      setPurging(false);
      setConfirming(false);
    }
  };

  const getCutoffDate = () => {
    const now = new Date();
    switch (timeRange) {
      case 'older-than-30':
        now.setDate(now.getDate() - 30);
        break;
      case 'older-than-90':
        now.setDate(now.getDate() - 90);
        break;
      case 'older-than-180':
        now.setDate(now.getDate() - 180);
        break;
      case 'all-time':
        return new Date(0); // Beginning of time
      default:
        now.setDate(now.getDate() - 90);
    }
    return now.toISOString();
  };

  const purgeOptions = [
    {
      type: "telemetry" as const,
      label: "Telemetry Data",
      description: "Raw sensor and system metrics",
      icon: Database,
      estimatedSize: "15.7 GB",
      impact: "Low",
      warning: "This will remove historical telemetry but keep alerts",
    },
    {
      type: "alerts" as const,
      label: "Alert Records",
      description: "Security alerts and audit trail",
      icon: AlertTriangle,
      estimatedSize: "2.3 GB",
      impact: "Medium",
      warning: "This will permanently delete alert history and audit logs",
    },
    {
      type: "all" as const,
      label: "All Device Data",
      description: "Complete device data removal",
      icon: Shield,
      estimatedSize: "26.9 GB",
      impact: "High",
      warning: "This will remove all data associated with the device",
    },
  ];

  const timeRanges = [
    { value: "older-than-30", label: "Older than 30 days" },
    { value: "older-than-90", label: "Older than 90 days" },
    { value: "older-than-180", label: "Older than 180 days" },
    { value: "all-time", label: "All time data" },
  ];

  const selectedPurgeOption = purgeOptions.find(opt => opt.type === purgeType);
  const getImpactColor = (impact: string) => {
    switch (impact) {
      case "Low": return "text-green-500 bg-green-500/10";
      case "Medium": return "text-amber-500 bg-amber-500/10";
      case "High": return "text-destructive bg-destructive/10";
      default: return "text-muted-foreground bg-muted";
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Trash2 className="h-4 w-4 text-destructive shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">Purge Device Data</h3>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 text-xs min-w-0">
          <AlertTriangle className="h-3 w-3 text-destructive" />
          <span className="text-destructive">Destructive Action</span>
        </div>
      </div>

      <div className="p-4 lg:p-5 space-y-4">
        {/* Device Selection */}
        <div>
          <label className="text-xs font-medium text-foreground block mb-2">Select Device</label>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-destructive/20"
          >
            <option value="">Choose a device...</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name} ({device.lastSeen})
              </option>
            ))}
          </select>
        </div>

        {/* Purge Type Selection */}
        <div>
          <label className="text-xs font-medium text-foreground block mb-2">Data to Purge</label>
          <div className="space-y-2">
            {purgeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.type}
                  onClick={() => setPurgeType(option.type)}
                  className={cn(
                    "w-full p-3 rounded-lg border text-left transition-all",
                    purgeType === option.type
                      ? "bg-destructive/10 border-destructive/30"
                      : "bg-background border-border hover:bg-accent/50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={cn(
                      "h-4 w-4 shrink-0 mt-0.5",
                      purgeType === option.type ? "text-destructive" : "text-muted-foreground"
                    )} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground">{option.label}</span>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          getImpactColor(option.impact)
                        )}>
                          {option.impact}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-1">{option.description}</div>
                      <div className="text-xs text-muted-foreground">~{option.estimatedSize}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Time Range Selection */}
        <div>
          <label className="text-xs font-medium text-foreground block mb-2">Time Range</label>
          <div className="grid grid-cols-2 gap-2">
            {timeRanges.map((range) => (
              <button
                key={range.value}
                onClick={() => setTimeRange(range.value)}
                className={cn(
                  "p-2 rounded-lg border text-xs transition-all",
                  timeRange === range.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-accent/50"
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* Warning Message */}
        {selectedDevice && selectedPurgeOption && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-destructive/10 border border-destructive/20"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <div className="text-xs text-destructive">
                <div className="font-medium mb-1">Warning: Destructive Action</div>
                <div>{selectedPurgeOption.warning}</div>
                <div className="mt-1">This action cannot be undone.</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Confirmation State */}
        {confirming ? (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-muted/50 border border-border">
              <div className="text-xs text-muted-foreground mb-2">Confirm purge action:</div>
              <div className="text-xs font-mono bg-background p-2 rounded border border-border">
                PURGE {purgeType.toUpperCase()} FROM {selectedDevice || 'DEVICE'} ({timeRange})
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={purging}
                className="flex-1 px-3 py-2 text-xs rounded-lg bg-background border border-border hover:bg-accent/50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePurge}
                disabled={purging}
                className="flex-1 px-3 py-2 text-xs rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {purging ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <motion.div
                      className="w-3 h-3 border border-current border-t-transparent rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    Purging...
                  </span>
                ) : (
                  "Confirm Purge"
                )}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={!selectedDevice}
            className="w-full py-2 px-3 rounded-lg text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Purge Data
          </button>
        )}
      </div>
    </div>
  );
}
