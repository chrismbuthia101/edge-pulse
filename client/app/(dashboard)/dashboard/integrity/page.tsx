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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useLogIntegrityStore } from "@/stores/log-integrity-store";
import { cn } from "@/lib/utils";

export default function IntegrityMonitoringPage() {
  const [selectedDevice, setSelectedDevice] = useState<string>("all");
  const [alertFilter, setAlertFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const {
    hashChainStatuses,
    verifying,
    initialize,
    verifyDeviceChain,
    tamperAlerts,
    integrityMetrics,
  } = useLogIntegrityStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

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
  };

  const activeAlertsCount = filteredAlerts.filter(a => a.status === "ACTIVE").length;
  const criticalAlertsCount = filteredAlerts.filter(a => a.severity === "CRITICAL").length;

  return (
    <div className="max-w-[1400px] space-y-6">
      {/* Header */}
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
            Real-time tamper-evident logging monitoring and alerts
          </p>
        </div>

        <div className="flex items-center gap-2">
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

          <Button variant="outline" size="sm">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
        </div>
      </motion.div>

      {/* Alert Banner */}
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

      {/* Metrics Overview */}
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

      {/* Main Content */}
      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="alerts">Tamper Alerts</TabsTrigger>
          <TabsTrigger value="chains">Hash Chains</TabsTrigger>
          <TabsTrigger value="metrics">Integrity Metrics</TabsTrigger>
        </TabsList>

        {/* Tamper Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          {/* Filters */}
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

          {/* Alerts List */}
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

        {/* Hash Chains Tab */}
        <TabsContent value="chains" className="space-y-4">
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

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
                        <p className="text-xs text-muted-foreground mb-1">Verification Progress</p>
                        <Progress
                          value={status.verified ? 100 : status.broken_at_sequence ? 0 : 50}
                          className="h-2"
                        />
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
        </TabsContent>

        {/* Integrity Metrics Tab */}
        <TabsContent value="metrics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Verification Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Verification Rate</span>
                    <span className="text-sm font-bold text-foreground">
                      {integrityMetrics?.verification_rate || 0}%
                    </span>
                  </div>
                  <Progress value={integrityMetrics?.verification_rate || 0} className="h-2" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Verified Devices</p>
                    <p className="text-xl font-bold text-green-500">
                      {integrityMetrics?.verified_devices || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Compromised Devices</p>
                    <p className="text-xl font-bold text-destructive">
                      {integrityMetrics?.compromised_devices || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Hash className="h-5 w-5 text-primary" />
                  Chain Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Entries</p>
                    <p className="text-xl font-bold text-foreground">
                      {(integrityMetrics?.total_entries || 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Verified Entries</p>
                    <p className="text-xl font-bold text-green-500">
                      {(integrityMetrics?.verified_entries || 0).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Avg Chain Length</span>
                    <span className="text-sm font-bold text-foreground">
                      {integrityMetrics?.average_chain_length || 0} entries
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
