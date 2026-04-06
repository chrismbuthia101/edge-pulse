"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import { Shield, ShieldCheck, AlertTriangle, Clock, Hash, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLogIntegrityStore } from "@/stores/log-integrity-store";

interface LogIntegrityPanelProps {
  deviceId?: string;
}

export function LogIntegrityPanel({ }: LogIntegrityPanelProps) {
  const {
    hashChainStatuses,
    verifying,
    initialize,
    verifyDeviceChain
  } = useLogIntegrityStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleVerifyChain = async (deviceId: string) => {
    await verifyDeviceChain(deviceId);
  };

  const getStatusIcon = (verified: boolean, brokenAt: number | null) => {
    if (!verified && brokenAt) {
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    }
    return verified ? <ShieldCheck className="h-4 w-4 text-green-500" /> : <Shield className="h-4 w-4 text-amber-500" />;
  };

  const getStatusColor = (verified: boolean, brokenAt: number | null) => {
    if (!verified && brokenAt) return "text-destructive bg-destructive/10 border-destructive/20";
    return verified ? "text-green-500 bg-green-500/10 border-green-500/20" : "text-amber-500 bg-amber-500/10 border-amber-500/20";
  };

  return (
    <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Hash className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">Log Integrity</h3>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 text-xs min-w-0">
          <Activity className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Hash Chain Verification</span>
        </div>
      </div>

      <div className="p-4 lg:p-5 space-y-3">
        {hashChainStatuses.map((status, index) => (
          <motion.div
            key={status.device_id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={cn(
              "flex items-center justify-between p-3 rounded-lg border",
              getStatusColor(status.verified, status.broken_at_sequence)
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              {getStatusIcon(status.verified, status.broken_at_sequence)}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {status.device_name}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>{status.total_entries.toLocaleString()} entries</span>
                  {status.last_verified_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Verified {new Date(status.last_verified_at).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                {status.broken_at_sequence && (
                  <p className="text-xs text-destructive mt-1">
                    Chain broken at entry #{status.broken_at_sequence}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={cn(
                "text-xs font-medium px-2 py-1 rounded-full",
                status.verified ? "bg-green-500/20 text-green-600" :
                  status.broken_at_sequence ? "bg-destructive/20 text-destructive" :
                    "bg-amber-500/20 text-amber-600"
              )}>
                {status.verified ? "Verified" : status.broken_at_sequence ? "Compromised" : "Unverified"}
              </span>

              {!status.verified && (
                <button
                  onClick={() => handleVerifyChain(status.device_id)}
                  disabled={verifying === status.device_id}
                  className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  {verifying === status.device_id ? "Verifying..." : "Verify"}
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
