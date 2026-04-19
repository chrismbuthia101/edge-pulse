"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
    Activity,
    Heart,
    AlertTriangle,
    CheckCircle,
    XCircle,
    RefreshCw,
    Monitor,
    Wifi,
    WifiOff,
    Cpu,
    HardDrive,
    MemoryStick,
    Zap,
    TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth/useAuth";
import { useHealthStore } from "@/stores/health-store";


export default function HealthPage() {
    const { hasRole } = useAuth();
    const { devices, systemHealth, loading, initialize, refreshHealthData } = useHealthStore();

    const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchHealthData = useCallback(async () => {
        await refreshHealthData();
    }, [refreshHealthData]);

    useEffect(() => {
        initialize();

        let interval: ReturnType<typeof setInterval>;
        if (autoRefresh) {
            interval = setInterval(fetchHealthData, 30000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [autoRefresh, fetchHealthData, initialize]);

    if (!hasRole(["ANALYST", "ADMINISTRATOR"])) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold">Access Denied</h3>
                    <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
                </div>
            </div>
        );
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case "ONLINE": return "bg-green-500/10 text-green-500 border-green-500/20";
            case "OFFLINE": return "bg-gray-500/10 text-gray-500 border-gray-500/20";
            case "WARNING": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
            case "ERROR": return "bg-red-500/10 text-red-500 border-red-500/20";
            default: return "bg-gray-500/10 text-gray-500 border-gray-500/20";
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "ONLINE": return <CheckCircle className="h-4 w-4" />;
            case "OFFLINE": return <XCircle className="h-4 w-4" />;
            case "WARNING": return <AlertTriangle className="h-4 w-4" />;
            case "ERROR": return <XCircle className="h-4 w-4" />;
            default: return <Activity className="h-4 w-4" />;
        }
    };

    const getUsageColor = (usage: number) => {
        if (usage >= 90) return "text-red-500";
        if (usage >= 75) return "text-amber-500";
        return "text-green-500";
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">System Health</h1>
                    <p className="text-muted-foreground">Monitor device health and system performance</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setAutoRefresh(!autoRefresh)}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                        {autoRefresh ? 'Auto-refresh On' : 'Auto-refresh Off'}
                    </Button>
                    <Button onClick={fetchHealthData}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{systemHealth?.total_devices || 0}</div>
                        <p className="text-xs text-muted-foreground">{systemHealth?.online_devices || 0} online</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">System Status</CardTitle>
                        <Heart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">Healthy</div>
                        <p className="text-xs text-muted-foreground">{systemHealth?.error_devices || 0} errors, {systemHealth?.warning_devices || 0} warnings</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg CPU Usage</CardTitle>
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${getUsageColor(systemHealth?.avg_cpu_usage || 0)}`}>
                            {Math.round(systemHealth?.avg_cpu_usage || 0)}%
                        </div>
                        <Progress value={systemHealth?.avg_cpu_usage || 0} className="mt-2" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">24h Alerts</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{systemHealth?.total_alerts_24h || 0}</div>
                        <p className="text-xs text-muted-foreground">{systemHealth?.critical_alerts_24h || 0} critical</p>
                    </CardContent>
                </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5" />
                            Device Health Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {devices.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    No device health data available
                                </div>
                            ) : (
                                devices.map((device) => (
                                    <div
                                        key={device.device_id}
                                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${selectedDevice === device.device_id ? 'bg-muted' : 'hover:bg-muted/50'}`}
                                        onClick={() => setSelectedDevice(selectedDevice === device.device_id ? null : device.device_id)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <Badge className={getStatusColor(device.status)}>
                                                    {getStatusIcon(device.status)}
                                                    {device.status}
                                                </Badge>
                                                <div>
                                                    <div className="font-medium">{device.hostname}</div>
                                                    <div className="text-sm text-muted-foreground">{device.operating_system} • {device.agent_version}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <div className="text-sm font-medium flex items-center gap-1">
                                                        <Cpu className="h-3 w-3" />
                                                        <span className={getUsageColor(device.cpu_usage)}>{Math.round(device.cpu_usage)}%</span>
                                                    </div>
                                                    <div className="text-sm font-medium flex items-center gap-1">
                                                        <MemoryStick className="h-3 w-3" />
                                                        <span className={getUsageColor(device.memory_usage)}>{Math.round(device.memory_usage)}%</span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-medium flex items-center gap-1">
                                                        {device.network_status ? <Wifi className="h-3 w-3 text-green-500" /> : <WifiOff className="h-3 w-3 text-red-500" />}
                                                        {device.network_status ? 'Connected' : 'Offline'}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">{device.alerts_last_24h} alerts</div>
                                                </div>
                                            </div>
                                        </div>
                                        {selectedDevice === device.device_id && (
                                            <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div>
                                                    <div className="text-sm font-medium flex items-center gap-1"><HardDrive className="h-3 w-3" />Disk Usage</div>
                                                    <div className={`text-lg font-bold ${getUsageColor(device.disk_usage)}`}>{Math.round(device.disk_usage)}%</div>
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium flex items-center gap-1"><Zap className="h-3 w-3" />Response Time</div>
                                                    <div className="text-lg font-bold">{device.response_time_ms}ms</div>
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium flex items-center gap-1"><TrendingUp className="h-3 w-3" />Uptime</div>
                                                    <div className="text-lg font-bold text-green-500">{Math.round(device.uptime_percentage)}%</div>
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium">Last Seen</div>
                                                    <div className="text-sm text-muted-foreground">{new Date(device.last_seen_utc).toLocaleString()}</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}