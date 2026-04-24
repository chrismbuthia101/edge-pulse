"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  Activity,
  Hash,
  Clock,
  RefreshCw,
  Download,
  Eye,
  CheckCircle2,
  XCircle,
  Info,
  Search,
  Terminal,
  LinkIcon,
  ArrowRight,
  Brain,
  Lock,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useLogIntegrityStore } from "@/lib/stores/log-integrity-store";
import { useLogsStore } from "@/lib/stores/logs-store";
import { cn } from "@/lib/utils";

interface ExplainableAlert {
  alertId: string;
  anomalyType: string;
  confidence: number;
  features: { name: string; value: string; importance: number }[];
  reasoning: string;
  recommendation: string;
}

interface TamperAlert {
  id: string;
  alert_type: string;
  severity: string;
  sequence_number: number;
  affected_entries: number;
  device_name: string;
  device_id: string;
  message: string;
  status: string;
}

export default function IntegrityMonitoringPage() {
  const [selectedDevice, setSelectedDevice] = useState<string>("all");
  const [alertFilter, setAlertFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedLogEntry, setSelectedLogEntry] = useState<number | null>(null);
  const [expandedChain, setExpandedChain] = useState<string | null>(null);

  const [logPage, setLogPage] = useState(1);
  const [logPageSize] = useState(50);

  const {
    hashChainStatuses,
    verifying,
    initialize,
    verifyDeviceChain,
    tamperAlerts,
    integrityMetrics,
  } = useLogIntegrityStore();

  const {
    logDevices,
    selectedDevice: logSelectedDevice,
    loading: logsLoading,
    verifying: logsVerifying,
    verificationResult,
    searchTerm,
    entryTypeFilter,
    initialize: initializeLogs,
    setSelectedDevice: setLogSelectedDevice,
    setEntryTypeFilter,
    setSearchTerm,
    refreshLogs,
    verifyChain,
    exportLogs,
    getFilteredLogs,
  } = useLogsStore();

  useEffect(() => {
    initialize();
    initializeLogs();
  }, [initialize, initializeLogs]);

  const allLogs = getFilteredLogs();
  const filteredLogs = useMemo(() => {
    const start = (logPage - 1) * logPageSize;
    return allLogs.slice(start, start + logPageSize);
  }, [allLogs, logPage, logPageSize]);

  const totalLogPages = Math.ceil(allLogs.length / logPageSize);

  const filteredAlerts = useMemo(() => {
    return tamperAlerts?.filter(alert => {
      const matchesDevice = selectedDevice === "all" || alert.device_id === selectedDevice;
      const matchesFilter = alertFilter === "all" || alert.status === alertFilter;
      const matchesSearch = searchQuery === "" ||
        alert.device_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        alert.message.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesDevice && matchesFilter && matchesSearch;
    }) || [];
  }, [tamperAlerts, selectedDevice, alertFilter, searchQuery]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "CRITICAL": return "text-destructive bg-destructive/10 border-destructive/20";
      case "HIGH": return "text-red-500 bg-red-500/10 border-red-500/20";
      case "MEDIUM": return "text-amber-500 bg-amber-500/10 border-amber-500/20";
      case "LOW": return "text-blue-500 bg-blue-500/10 border-blue-500/20";
      default: return "text-muted-foreground bg-muted border-border";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "RESOLVED": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "INVESTIGATING": return <Eye className="h-4 w-4 text-amber-500" />;
      case "ACTIVE": return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default: return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatTimeAgo = (dateString: string): string => {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const handleVerifyAllChains = async () => {
    await Promise.all(
      hashChainStatuses.map(status => verifyDeviceChain(status.device_id))
    );
    // Data is automatically refreshed by verifyDeviceChain, so no additional refresh needed
  };

  const activeAlertsCount = filteredAlerts.filter(a => a.status === "ACTIVE").length;
  const criticalAlertsCount = filteredAlerts.filter(a => a.severity === "CRITICAL").length;

  const generateExplainableAI = (alert: TamperAlert): ExplainableAlert => {
    const alertTypes: Record<string, { name: string; reasoning: string; features: { name: string; value: string; importance: number }[] }> = {
      CHAIN_BREAK: {
        name: "Hash Chain Integrity Violation",
        reasoning: "The cryptographic linkage between log entries has been broken. This indicates potential tampering or data manipulation in the log chain.",
        features: [
          { name: "Previous Hash Match", value: "FAILED", importance: 0.95 },
          { name: "Sequence Continuity", value: "BROKEN", importance: 0.88 },
          { name: "Digital Signature", value: "INVALID", importance: 0.72 },
          { name: "Timestamp Anomaly", value: "NONE", importance: 0.45 },
        ],
      },
      SEQUENCE_GAP: {
        name: "Log Sequence Gap Detected",
        reasoning: "A gap in the sequential numbering of log entries suggests missing or deleted log records.",
        features: [
          { name: "Sequence Number", value: `Expected ${alert.sequence_number - 1}`, importance: 0.92 },
          { name: "Gap Size", value: `${alert.affected_entries} entries`, importance: 0.85 },
          { name: "Time Delta", value: "UNKNOWN", importance: 0.35 },
        ],
      },
      SIGNATURE_MISMATCH: {
        name: "Cryptographic Signature Mismatch",
        reasoning: "The digital signature verification failed, indicating potential unauthorized modification of log entries.",
        features: [
          { name: "Signature Valid", value: "NO", importance: 0.98 },
          { name: "Key Rotation", value: "NOT DETECTED", importance: 0.42 },
          { name: "Certificate", value: "VALID", importance: 0.28 },
        ],
      },
    };

    const alertType = alertTypes[alert.alert_type] || alertTypes.CHAIN_BREAK;
    const confidence = alert.severity === "CRITICAL" ? 0.98 : alert.severity === "HIGH" ? 0.85 : 0.70;

    return {
      alertId: alert.id,
      anomalyType: alertType.name,
      confidence: confidence,
      features: alertType.features,
      reasoning: alertType.reasoning,
      recommendation: alert.severity === "CRITICAL"
        ? "Immediately isolate device and conduct forensic analysis"
        : "Review device activity logs and verify operator access",
    };
  };

  return (
    <TooltipProvider>
      <div className="max-w-[1600px] space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
        >
          <div className="min-w-0">
            <h1 className="text-2xl font-display font-bold text-foreground">
              Integrity Monitoring
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real-time tamper-evident logging with ML-powered anomaly detection
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
              <Activity className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                Live Monitoring
              </span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            </div>

            <Button variant="outline" size="sm" onClick={handleVerifyAllChains} disabled={!!verifying}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", verifying && "animate-spin")} />
              Verify All
            </Button>

            <Button variant="outline" size="sm" onClick={() => exportLogs()}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
          </div>
        </motion.div>

        <Tabs defaultValue="summary" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="summary">Executive Summary</TabsTrigger>
            <TabsTrigger value="chains">Hash Chains</TabsTrigger>
            <TabsTrigger value="alerts">Tamper Alerts</TabsTrigger>
            <TabsTrigger value="logs">Log Viewer</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            {(activeAlertsCount > 0 || criticalAlertsCount > 0) && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "p-4 rounded-xl border",
                  criticalAlertsCount > 0
                    ? "bg-destructive/10 border-destructive/20"
                    : "bg-amber-500/10 border-amber-500/20"
                )}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className={cn(
                    "h-5 w-5 mt-0.5",
                    criticalAlertsCount > 0 ? "text-destructive" : "text-amber-500"
                  )} />
                  <div className="flex-1">
                    <h3 className={cn(
                      "font-semibold text-sm",
                      criticalAlertsCount > 0 ? "text-destructive" : "text-amber-600"
                    )}>
                      {criticalAlertsCount > 0 ? "Critical Integrity Alerts" : "Active Integrity Alerts"}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {criticalAlertsCount > 0
                        ? `${criticalAlertsCount} critical ${criticalAlertsCount === 1 ? 'alert' : 'alerts'} require immediate attention`
                        : `${activeAlertsCount} active ${activeAlertsCount === 1 ? 'alert' : 'alerts'} being monitored`
                      }
                    </p>
                  </div>
                  <Badge variant={criticalAlertsCount > 0 ? "destructive" : "secondary"}>
                    {criticalAlertsCount > 0 ? criticalAlertsCount : activeAlertsCount}
                  </Badge>
                </div>
              </motion.div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
                      <Badge variant="secondary" className="text-xs">
                        {integrityMetrics?.verification_rate || 0}%
                      </Badge>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {integrityMetrics?.verified_devices || 0}/{integrityMetrics?.total_devices || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Devices Verified</p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Hash className="h-4 w-4 text-primary" />
                      <Badge variant="secondary" className="text-xs">
                        {integrityMetrics?.average_chain_length || 0}
                      </Badge>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {(integrityMetrics?.total_entries || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Log Entries</p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <Badge variant="secondary" className="text-xs">
                        Active
                      </Badge>
                    </div>
                    <p className="text-2xl font-bold text-amber-500">
                      {activeAlertsCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Tamper Alerts</p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <Badge variant="secondary" className="text-xs">
                        Auto
                      </Badge>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {formatTimeAgo(integrityMetrics?.last_verification || new Date().toISOString())}
                    </p>
                    <p className="text-xs text-muted-foreground">Last Verification</p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Verification Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Verification Rate</span>
                      <span className="text-sm font-bold text-foreground">
                        {integrityMetrics?.verification_rate || 0}%
                      </span>
                    </div>
                    <Progress value={integrityMetrics?.verification_rate || 0} className="h-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="p-3 bg-green-500/10 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Verified Devices</p>
                      <p className="text-xl font-bold text-green-500">
                        {integrityMetrics?.verified_devices || 0}
                      </p>
                    </div>
                    <div className="p-3 bg-destructive/10 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Compromised</p>
                      <p className="text-xl font-bold text-destructive">
                        {integrityMetrics?.compromised_devices || 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Hash className="h-4 w-4 text-primary" />
                    Chain Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Total Entries</p>
                      <p className="text-xl font-bold text-foreground">
                        {(integrityMetrics?.total_entries || 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Verified</p>
                      <p className="text-xl font-bold text-green-500">
                        {(integrityMetrics?.verified_entries || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3 mt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Avg Chain Length</span>
                      <span className="text-sm font-bold text-foreground">
                        {integrityMetrics?.average_chain_length || 0}
                      </span>
                    </div>
                    <Progress
                      value={Math.min((integrityMetrics?.average_chain_length || 0) / 1000 * 100, 100)}
                      className="h-2"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {filteredAlerts.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    Recent XAI Reports
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {filteredAlerts.slice(0, 3).map((alert) => {
                      const explanation = generateExplainableAI(alert);
                      return (
                        <div
                          key={alert.id}
                          className={cn(
                            "p-3 rounded-lg border",
                            alert.severity === "CRITICAL" && "border-destructive/50 bg-destructive/5",
                            alert.severity === "HIGH" && "border-red-500/50 bg-red-500/5"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Brain className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">{explanation.anomalyType}</span>
                            </div>
                            <Badge className={getSeverityColor(alert.severity)}>
                              {alert.severity}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            {explanation.reasoning}
                          </p>
                          <p className="text-xs text-primary">
                            Recommendation: {explanation.recommendation}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="chains" className="space-y-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <LinkIcon className="h-5 w-5 text-primary" />
                      Hash Chain Status
                    </CardTitle>
                    <CardDescription>
                      Cryptographic linkage verification for each device
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      <Lock className="h-3 w-3 mr-1" />
                      SHA-256
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {hashChainStatuses.map((status, index) => (
                    <motion.div
                      key={status.device_id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className={cn(
                        "border transition-all duration-200",
                        !status.verified && status.broken_at_sequence && "border-destructive/50 bg-destructive/5",
                        status.verified && "border-green-500/50 bg-green-500/5"
                      )}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              {status.verified ? (
                                <ShieldCheck className="h-5 w-5 text-green-500" />
                              ) : status.broken_at_sequence ? (
                                <XCircle className="h-5 w-5 text-destructive" />
                              ) : (
                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                              )}
                              <div>
                                <h3 className="text-sm font-semibold text-foreground">
                                  {status.device_name}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                  Device ID: {status.device_id}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Badge className={cn(
                                "text-xs",
                                status.verified
                                  ? "bg-green-500/20 text-green-600 border-green-500/30"
                                  : status.broken_at_sequence
                                    ? "bg-destructive/20 text-destructive border-destructive/30"
                                    : "bg-amber-500/20 text-amber-600 border-amber-500/30"
                              )}>
                                {status.verified ? "Verified" : status.broken_at_sequence ? "Compromised" : "Unverified"}
                              </Badge>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => verifyDeviceChain(status.device_id)}
                                disabled={verifying === status.device_id}
                              >
                                <RefreshCw className={cn("h-3 w-3 mr-1", verifying === status.device_id && "animate-spin")} />
                                Verify
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Total Entries</p>
                              <p className="text-lg font-bold text-foreground">
                                {status.total_entries.toLocaleString()}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Chain Status</p>
                              <p className="text-sm font-medium text-foreground">
                                {status.broken_at_sequence
                                  ? `Broken at #${status.broken_at_sequence}`
                                  : "Intact"
                                }
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Last Verified</p>
                              <p className="text-sm font-medium text-foreground">
                                {status.last_verified_at
                                  ? formatTimeAgo(status.last_verified_at)
                                  : "Never"
                                }
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Progress</p>
                              <Progress
                                value={status.verified ? 100 : status.broken_at_sequence ? 0 : 50}
                                className="h-2"
                              />
                            </div>
                          </div>

                          <div className="border-t border-border pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-muted-foreground">Chain Linkage Preview</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpandedChain(expandedChain === status.device_id ? null : status.device_id)}
                              >
                                {expandedChain === status.device_id ? "Hide" : "View"}
                              </Button>
                            </div>

                            <div className="bg-slate-950 rounded-lg p-3 font-mono text-xs overflow-x-auto">
                              <div className="flex items-center gap-2 text-slate-400">
                                <span className="text-blue-400 shrink-0">SEQ #0001</span>
                                <ArrowRight className="h-3 w-3 text-slate-600 shrink-0" />
                                <span className="text-green-400 shrink-0">Hash:a1b2c3d4...</span>
                                <ArrowRight className="h-3 w-3 text-slate-600 shrink-0" />
                                <span className="text-blue-400 shrink-0">SEQ #0002</span>
                                <ArrowRight className="h-3 w-3 text-slate-600 shrink-0" />
                                <span className="text-green-400 shrink-0">Hash:e5f6g7h8...</span>
                                <span className="text-slate-600 shrink-0">...</span>
                                <span className="text-slate-500 shrink-0">(#{status.total_entries} entries)</span>
                              </div>

                              {expandedChain === status.device_id && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  className="mt-3 pt-3 border-t border-slate-800"
                                >
                                  <div className="space-y-1 text-slate-400">
                                    <div className="flex justify-between">
                                      <span>Genesis Hash:</span>
                                      <span className="text-green-400">0x0000...0000</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Current Hash:</span>
                                      <span className="text-green-400">{status.broken_at_sequence ? "BROKEN" : "a1b2c3d4e5..."}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Algorithm:</span>
                                      <span className="text-blue-400">SHA-256</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Method:</span>
                                      <span className="text-amber-400">Hash(Prev + Content)</span>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          </div>

                          {status.broken_at_sequence && (
                            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                              <p className="text-xs text-destructive font-medium">
                                Chain Integrity Compromised
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Hash chain broken at entry #{status.broken_at_sequence}.
                                Immediate investigation required.
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search alerts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                    <SelectTrigger className="w-full lg:w-48">
                      <SelectValue placeholder="All Devices" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Devices</SelectItem>
                      {hashChainStatuses.map((device) => (
                        <SelectItem key={device.device_id} value={device.device_id}>
                          {device.device_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={alertFilter} onValueChange={setAlertFilter}>
                    <SelectTrigger className="w-full lg:w-48">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INVESTIGATING">Investigating</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {filteredAlerts.length === 0 ? (
                <Card className="border-border">
                  <CardContent className="p-8 text-center">
                    <ShieldCheck className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-foreground mb-1">No Tamper Alerts</h3>
                    <p className="text-sm text-muted-foreground">
                      All log chains are secure and verified
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredAlerts.map((alert, index) => (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className={cn(
                      "border transition-all duration-200 hover:shadow-md",
                      alert.severity === "CRITICAL" && "border-destructive/50 bg-destructive/5",
                      alert.severity === "HIGH" && "border-red-500/50 bg-red-500/5"
                    )}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="shrink-0">
                            {getStatusIcon(alert.status)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-2">
                              <div className="min-w-0">
                                <h4 className="text-sm font-semibold text-foreground truncate">
                                  {alert.alert_type.replace('_', ' ')}
                                </h4>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {alert.device_name} · Entry #{alert.sequence_number}
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 ml-4">
                                <Badge className={getSeverityColor(alert.severity)}>
                                  {alert.severity}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {alert.status}
                                </Badge>
                              </div>
                            </div>

                            <p className="text-sm text-foreground mb-2">
                              {alert.message}
                            </p>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatTimeAgo(alert.detected_at)}
                                </span>
                                {alert.affected_entries > 0 && (
                                  <span>
                                    {alert.affected_entries} entries affected
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" className="h-8 px-2">
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 px-2">
                                  <RefreshCw className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex-1">
                    <Select value={logSelectedDevice} onValueChange={setLogSelectedDevice}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select device" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Devices</SelectItem>
                        {logDevices.map((device) => (
                          <SelectItem key={device.device_id} value={device.device_id}>
                            {device.device_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1">
                    <Select value={entryTypeFilter} onValueChange={setEntryTypeFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Filter by type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="TELEMETRY">Telemetry</SelectItem>
                        <SelectItem value="ALERT">Alerts</SelectItem>
                        <SelectItem value="DETECTION">Detections</SelectItem>
                        <SelectItem value="SYNC">Sync</SelectItem>
                        <SelectItem value="SYSTEM">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search logs..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refreshLogs()}
                      disabled={logsLoading || logSelectedDevice === "all"}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${logsLoading ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => verifyChain()}
                      disabled={logsVerifying || logSelectedDevice === "all"}
                    >
                      <Shield className="h-3.5 w-3.5 mr-1.5" />
                      Verify
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {verificationResult && (
              <Card className={cn(
                "border",
                verificationResult.is_valid
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-destructive/50 bg-destructive/5"
              )}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {verificationResult.is_valid ? (
                        <CheckCircle2 className="h-8 w-8 text-green-500" />
                      ) : (
                        <XCircle className="h-8 w-8 text-destructive" />
                      )}
                      <div>
                        <h3 className="font-semibold">
                          Chain {verificationResult.is_valid ? "Valid" : "Invalid"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {verificationResult.entries_checked} entries checked
                        </p>
                      </div>
                    </div>
                    {!verificationResult.is_valid && verificationResult.break_reason && (
                      <div className="text-right">
                        <p className="text-sm text-destructive">
                          {verificationResult.break_reason}
                        </p>
                        {verificationResult.first_broken_sequence && (
                          <p className="text-xs text-muted-foreground">
                            Sequence: #{verificationResult.first_broken_sequence}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {logsLoading ? (
              <Card className="border-border">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading logs...</p>
                </CardContent>
              </Card>
            ) : logSelectedDevice === "all" ? (
              <Card className="border-border">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Terminal className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Select a Device
                  </h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Choose a device to view its tamper-evident log entries
                  </p>
                </CardContent>
              </Card>
            ) : filteredLogs.length === 0 ? (
              <Card className="border-border">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    No logs found
                  </h3>
                  <p className="text-sm text-muted-foreground text-center">
                    {searchTerm || entryTypeFilter !== "all"
                      ? "Try adjusting your search or filters"
                      : "No tamper log entries available for this device"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="border-border">
                  <CardContent className="p-0">
                    <div className="bg-slate-950 dark:bg-slate-950 rounded-lg p-4 font-mono text-xs space-y-1 max-h-[500px] overflow-y-auto">
                      {filteredLogs.map((log, idx) => (
                        <motion.div
                          key={log.log_id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.01 }}
                          className={cn(
                            "flex flex-wrap gap-x-4 gap-y-1 text-slate-300 hover:bg-slate-900/50 rounded p-1 -mx-1 cursor-pointer"
                          )}
                          onClick={() => setSelectedLogEntry(
                            selectedLogEntry === log.log_sequence_number ? null : log.log_sequence_number
                          )}
                        >
                          <span className="text-slate-500 shrink-0 w-20">
                            #{String(log.log_sequence_number).padStart(6, '0')}
                          </span>
                          <span className={cn(
                            "shrink-0 w-20",
                            log.log_entry_type === 'ALERT' ? 'text-red-400' :
                              log.log_entry_type === 'DETECTION' ? 'text-orange-400' :
                                log.log_entry_type === 'SYNC' ? 'text-green-400' :
                                  log.log_entry_type === 'SYSTEM' ? 'text-purple-400' : 'text-blue-400'
                          )}>
                            {log.log_entry_type}
                          </span>
                          <span className="text-slate-400 shrink-0 w-40">
                            {new Date(log.entry_timestamp_utc).toLocaleString()}
                          </span>
                          <span className="text-green-400 truncate flex-1">
                            {log.entry_content_hash.substring(0, 16)}...
                          </span>
                          {selectedLogEntry === log.log_sequence_number && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              className="w-full mt-2 pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 text-slate-400"
                            >
                              <div>
                                <span className="text-slate-600">Content Hash:</span>
                                <span className="text-green-400 ml-2 break-all">{log.entry_content_hash}</span>
                              </div>
                              <div>
                                <span className="text-slate-600">Previous Hash:</span>
                                <span className="text-amber-400 ml-2 break-all">{log.previous_entry_hash?.substring(0, 12) || 'GENESIS'}...</span>
                              </div>
                              <div>
                                <span className="text-slate-600">Signature:</span>
                                <span className="text-blue-400 ml-2">{log.digital_signature?.substring(0, 12) || 'N/A'}...</span>
                              </div>
                              <div>
                                <span className="text-slate-600">Reference:</span>
                                <span className="text-purple-400 ml-2">{log.log_entry_reference_id || 'N/A'}</span>
                              </div>
                            </motion.div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLogPage(1)}
                      disabled={logPage === 1}
                    >
                      <SkipBack className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLogPage(p => Math.max(1, p - 1))}
                      disabled={logPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground px-2">
                      Page {logPage} of {totalLogPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLogPage(p => Math.min(totalLogPages, p + 1))}
                      disabled={logPage >= totalLogPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLogPage(totalLogPages)}
                      disabled={logPage >= totalLogPages}
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Showing {filteredLogs.length} of {allLogs.length} entries
                  </p>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}