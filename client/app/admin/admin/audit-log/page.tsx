"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, AlertTriangle, Info, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/useAuth";
import { useRouter } from "next/navigation";
import { useLogsStore } from "@/lib/stores/logs-store";

const severityStyles: Record<string, { color: string; bg: string }> = {
  ERROR: { color: "text-destructive", bg: "bg-destructive/10" },
  WARNING: { color: "text-amber-500", bg: "bg-amber-500/10" },
  INFO: { color: "text-blue-500", bg: "bg-blue-500/10" },
};

export default function PlatformAuditLogPage() {
  const { hasRole, loading } = useAuth();
  const router = useRouter();
  const status = useLogsStore((s) => s.status);
  const searchTerm = useLogsStore((s) => s.searchTerm);
  const setSearchTerm = useLogsStore((s) => s.setSearchTerm);
  const logs = useLogsStore((s) => s.getFilteredLogs());

  useEffect(() => {
    if (!loading && !hasRole(["PLATFORM_ADMIN"])) {
      router.push("/dashboard");
    }
  }, [loading, hasRole, router]);

  useEffect(() => {
    useLogsStore.getState().refreshLogs();
  }, []);

  if (!hasRole(["PLATFORM_ADMIN"])) return null;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Platform Audit Log
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          All audit events across every organization
        </p>
      </motion.div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by action or resource type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {status === "loading" ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      severityStyles[log.severity]?.bg || "bg-muted"
                    }`}
                  >
                    {log.severity === "ERROR" ? (
                      <AlertTriangle
                        className={`h-4 w-4 ${severityStyles[log.severity]?.color || "text-muted-foreground"}`}
                      />
                    ) : log.severity === "WARNING" ? (
                      <AlertTriangle
                        className={`h-4 w-4 ${severityStyles[log.severity]?.color || "text-muted-foreground"}`}
                      />
                    ) : (
                      <Info
                        className={`h-4 w-4 ${severityStyles[log.severity]?.color || "text-muted-foreground"}`}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{log.action}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {log.resource_type}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${severityStyles[log.severity]?.color || ""}`}
                      >
                        {log.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No audit log entries found
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
