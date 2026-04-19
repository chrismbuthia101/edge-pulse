"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    FileText,
    Download,
    TrendingUp,
    AlertTriangle,
    Shield,
    PieChart,
    Activity,
    Clock,
    Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReportStore } from "@/stores/report-store";
import { useAuth } from "@/lib/auth/useAuth";


const severityColors: Record<string, string> = {
    LOW: "bg-green-500/10 text-green-500 border-green-500/20",
    MEDIUM: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    HIGH: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    CRITICAL: "bg-red-500/10 text-red-500 border-red-500/20",
};

export default function ReportsPage() {
    const { hasRole } = useAuth();
    const { reportData, loading, dateRange, setDateRange, initialize, generateReport } = useReportStore();

    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        initialize();
    }, [initialize]);

    if (!hasRole(["ADMINISTRATOR"])) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold">Access Denied</h3>
                    <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
                </div>
            </div>
        );
    }

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
                    <h1 className="text-2xl font-display font-bold text-foreground">Security Reports</h1>
                    <p className="text-muted-foreground">Generate and analyze security reports</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => generateReport("pdf")} variant="outline">
                        <Download className="h-4 w-4 mr-2" />Export PDF
                    </Button>
                    <Button onClick={() => generateReport("csv")}>
                        <Download className="h-4 w-4 mr-2" />Export CSV
                    </Button>
                </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Search reports..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                                </div>
                            </div>
                            <Select value={dateRange} onValueChange={setDateRange}>
                                <SelectTrigger className="w-48"><SelectValue placeholder="Select date range" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1d">Last 24 hours</SelectItem>
                                    <SelectItem value="7d">Last 7 days</SelectItem>
                                    <SelectItem value="30d">Last 30 days</SelectItem>
                                    <SelectItem value="90d">Last 90 days</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{reportData?.totalAlerts || 0}</div>
                        <p className="text-xs text-muted-foreground">In selected period</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Critical Alerts</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-500">{reportData?.criticalAlerts || 0}</div>
                        <p className="text-xs text-muted-foreground">Require immediate attention</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Devices</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{reportData?.activeDevices || 0}</div>
                        <p className="text-xs text-muted-foreground">of {reportData?.totalDevices || 0} total devices</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{reportData?.avgResponseTime || 0}ms</div>
                        <p className="text-xs text-muted-foreground">Alert processing time</p>
                    </CardContent>
                </Card>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <PieChart className="h-5 w-5" />Alerts by Severity
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {Object.entries(reportData?.alertsBySeverity || {}).map(([severity, count]) => (
                                    <div key={severity} className="flex items-center justify-between">
                                        <Badge className={severityColors[severity] || ""}>{severity}</Badge>
                                        <div className="text-sm font-medium">{count}</div>
                                    </div>
                                ))}
                                {Object.keys(reportData?.alertsBySeverity || {}).length === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5" />Recent Alerts
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {reportData?.recentAlerts.map((alert) => (
                                    <div key={alert.alert_id} className="flex items-center justify-between p-3 border rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <Badge className={severityColors[alert.severity] || ""}>{alert.severity}</Badge>
                                            <div>
                                                <div className="text-sm font-medium">{alert.device_name || alert.device_id}</div>
                                                <div className="text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString()}</div>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="sm">View</Button>
                                    </div>
                                ))}
                                {(reportData?.recentAlerts || []).length === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-4">No alerts in period</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </div>
    );
}