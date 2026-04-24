"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
    ArrowLeft, Download, RefreshCw, Filter, Search, ShieldAlert,
    TrendingUp,
    Activity, Zap, Network, Cpu, Shield,
} from "lucide-react";
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAlertStore } from "@/lib/stores/alert-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PDFReportService, type ReportData } from "@/lib/services/pdf-report-service";

const SEV_COLORS: Record<string, string> = {
    critical: "#ef4444",
    high: "#f97316",
    medium: "#f59e0b",
    low: "#06b6d4",
};

const STATUS_COLORS: Record<string, string> = {
    PENDING: "#ef4444",
    ACKNOWLEDGED: "#f59e0b",
    INVESTIGATED: "#3b82f6",
    CLOSED: "#22c55e",
};

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
            <p className="text-muted-foreground mb-1">{label}</p>
            {payload.map(p => (
                <p key={p.name} className="font-bold" style={{ color: p.color }}>{p.name}: {p.value}</p>
            ))}
        </div>
    );
}

type DateRange = "7d" | "30d" | "90d" | "all";
type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";
type StatusFilter = "all" | "PENDING" | "ACKNOWLEDGED" | "INVESTIGATED" | "CLOSED";
type SourceFilter = "all" | "PROCESS" | "NETWORK" | "FILE" | "RESOURCE";

export default function AlertAnalysisReport() {
    useEffect(() => { document.title = "Alert Analysis Report - EdgePulse"; }, []);
    const router = useRouter();
    const { alerts } = useAlertStore();
    const { devices } = useDeviceStore();
    const initialized = useRef(false);

    const [dateRange, setDateRange] = useState<DateRange>("30d");
    const [severity, setSeverity] = useState<SeverityFilter>("all");
    const [status, setStatus] = useState<StatusFilter>("all");
    const [source, setSource] = useState<SourceFilter>("all");
    const [search, setSearch] = useState("");
    const [selectedDevice, setSelectedDevice] = useState("all");
    const [exporting, setExporting] = useState(false);
    const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("csv");

    const { initialize } = useAlertStore();
    useEffect(() => {
        if (!initialized.current) { initialized.current = true; initialize(); }
    }, [initialize]);

    const cutoff = useMemo(() => {
        if (dateRange === "all") return new Date(0);
        const d = new Date();
        const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
        d.setDate(d.getDate() - days);
        return d;
    }, [dateRange]);

    const filtered = useMemo(() => {
        return alerts.filter(a => {
            if (dateRange !== "all" && new Date(a.created_at) < cutoff) return false;
            if (severity !== "all" && a.severity !== severity) return false;
            if (status !== "all" && a.status !== status) return false;
            if (source !== "all" && a.telemetry_source !== source) return false;
            if (selectedDevice !== "all" && a.device_id !== selectedDevice) return false;
            if (search && !a.title.toLowerCase().includes(search.toLowerCase()) && !a.device_name?.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
    }, [alerts, dateRange, cutoff, severity, status, source, selectedDevice, search]);

    const metrics = useMemo(() => ({
        total: filtered.length,
        critical: filtered.filter(a => a.severity === "critical").length,
        pending: filtered.filter(a => a.status === "PENDING").length,
        closed: filtered.filter(a => a.status === "CLOSED").length,
        resolutionRate: filtered.length > 0 ? Math.round((filtered.filter(a => a.status === "CLOSED").length / filtered.length) * 100) : 0,
        avgLatency: filtered.length > 0 ? Math.round(filtered.reduce((s, a) => s + a.inference_latency_ms, 0) / filtered.length) : 0,
    }), [filtered]);

    const timeSeries = useMemo(() => {
        const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : dateRange === "90d" ? 90 : 30;
        const buckets: Record<string, { date: string; critical: number; high: number; medium: number; low: number }> = {};
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            buckets[key] = { date: key, critical: 0, high: 0, medium: 0, low: 0 };
        }
        filtered.forEach(a => {
            const key = new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            if (buckets[key]) buckets[key][a.severity as keyof typeof buckets[string]]++;
        });
        return Object.values(buckets);
    }, [filtered, dateRange]);

    const severityDist = useMemo(() => {
        const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
        filtered.forEach(a => { if (counts[a.severity] !== undefined) counts[a.severity]++; });
        return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value, color: SEV_COLORS[name] }));
    }, [filtered]);

    const statusDist = useMemo(() => {
        const counts: Record<string, number> = { PENDING: 0, ACKNOWLEDGED: 0, INVESTIGATED: 0, CLOSED: 0 };
        filtered.forEach(a => { counts[a.status]++; });
        return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name: name.charAt(0) + name.slice(1).toLowerCase(), value, color: STATUS_COLORS[name] }));
    }, [filtered]);

    const topDevices = useMemo(() => {
        const counts: Record<string, { name: string; count: number; critical: number }> = {};
        filtered.forEach(a => {
            const name = devices.find(d => d.id === a.device_id)?.name || a.device_name || a.device_id;
            if (!counts[a.device_id]) counts[a.device_id] = { name, count: 0, critical: 0 };
            counts[a.device_id].count++;
            if (a.severity === "critical") counts[a.device_id].critical++;
        });
        return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 8);
    }, [filtered, devices]);

    const categoryDist = useMemo(() => {
        const counts: Record<string, number> = {};
        filtered.forEach(a => {
            if (a.category) counts[a.category] = (counts[a.category] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));
    }, [filtered]);

    const uniqueDevices = useMemo(() => {
        const map = new Map<string, string>();
        alerts.forEach(a => { if (a.device_id) map.set(a.device_id, devices.find(d => d.id === a.device_id)?.name || a.device_name || a.device_id); });
        return Array.from(map.entries());
    }, [alerts, devices]);

    const telemetrySourceIcon = (s?: string) => {
        if (s === "PROCESS") return <Activity className="h-3 w-3" />;
        if (s === "NETWORK") return <Network className="h-3 w-3" />;
        if (s === "FILE") return <Shield className="h-3 w-3" />;
        if (s === "RESOURCE") return <Cpu className="h-3 w-3" />;
        return <Zap className="h-3 w-3" />;
    };

    const handleExportAlertPDF = async (alert: typeof filtered[0]) => {
        try {
            setExporting(true);
            setExportFormat("pdf");
            const pdfService = new PDFReportService();

            const now = new Date();

            const reportData: ReportData = {
                title: `Alert Report: ${alert.title}`,
                dateRange: { start: new Date(alert.created_at), end: now },
                generatedAt: now,
                executiveSummary: {
                    totalAlerts: 1,
                    criticalAlerts: alert.severity === "critical" ? 1 : 0,
                    devicesMonitored: 1,
                    mlAccuracy: 0.95,
                },
                alertTrends: [],
                deviceRiskMatrix: [{
                    deviceId: alert.device_id || alert.id,
                    deviceName: alert.device_name || "Unknown",
                    riskScore: alert.anomaly_score || 0.5,
                    status: alert.severity === "critical" ? "critical" : alert.severity === "high" ? "high" : "normal",
                }],
                distribution: {
                    bySeverity: {
                        critical: alert.severity === "critical" ? 1 : 0,
                        high: alert.severity === "high" ? 1 : 0,
                        medium: alert.severity === "medium" ? 1 : 0,
                        low: alert.severity === "low" ? 1 : 0,
                    },
                    byCategory: {
                        anomaly: alert.category === "anomaly" ? 1 : 0,
                        security: alert.category === "security" ? 1 : 0,
                        system: alert.category === "system" ? 1 : 0,
                    },
                },
                topDevices: [{
                    deviceName: alert.device_name || "Unknown",
                    alertCount: 1,
                    avgRiskScore: alert.anomaly_score || 0.5,
                }],
                criticalIncidents: [{
                    id: alert.alert_id || alert.id,
                    deviceName: alert.device_name || "Unknown",
                    severity: alert.severity,
                    description: typeof alert.explanation_json === 'object' ? JSON.stringify(alert.explanation_json).substring(0, 200) : alert.title,
                    timestamp: new Date(alert.created_at),
                }],
                mlPerformance: {
                    modelVersion: "1.0.0",
                    accuracy: 0.95,
                    precision: 0.92,
                    recall: 0.88,
                    f1Score: 0.90,
                },
            };

            const blob = await pdfService.generateReport(reportData);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `alert-${alert.alert_id || alert.id}-${now.toISOString().split('T')[0]}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Alert PDF exported successfully');
        } catch (error) {
            console.error('Alert PDF export failed:', error);
            toast.error('Failed to export alert PDF');
        } finally {
            setExporting(false);
        }
    };

    const handleExportPDF = async () => {
        try {
            setExporting(true);
            setExportFormat("pdf");
            const pdfService = new PDFReportService();

            const now = new Date();
            const start = new Date(cutoff);

            // Capture charts
            const chartImages = [];
            try {
                const trendsChart = await pdfService.captureChart("alert-trends-chart", "Alert Trends by Severity");
                chartImages.push(trendsChart);
            } catch (e) {
                console.warn("Failed to capture trends chart:", e);
            }
            try {
                const severityChart = await pdfService.captureChart("severity-distribution-chart", "Severity Distribution");
                chartImages.push(severityChart);
            } catch (e) {
                console.warn("Failed to capture severity chart:", e);
            }
            try {
                const statusChart = await pdfService.captureChart("status-distribution-chart", "Status Distribution");
                chartImages.push(statusChart);
            } catch (e) {
                console.warn("Failed to capture status chart:", e);
            }

            const reportData: ReportData = {
                title: "Alert Analysis Report",
                dateRange: { start, end: now },
                generatedAt: now,
                executiveSummary: {
                    totalAlerts: metrics.total,
                    criticalAlerts: metrics.critical,
                    devicesMonitored: uniqueDevices.length,
                    mlAccuracy: 0.95, // Placeholder - would come from actual metrics
                },
                alertTrends: timeSeries.map(t => ({ date: t.date, count: t.critical + t.high + t.medium + t.low })),
                deviceRiskMatrix: topDevices.map(d => ({
                    deviceId: devices.find(dev => dev.name === d.name)?.id || d.name,
                    deviceName: d.name,
                    riskScore: d.critical > 0 ? 0.9 + (d.critical / d.count) * 0.1 : 0.3,
                    status: d.critical > 0 ? "critical" : d.count > 10 ? "high" : "normal",
                })),
                distribution: {
                    bySeverity: {
                        critical: metrics.critical,
                        high: filtered.filter(a => a.severity === "high").length,
                        medium: filtered.filter(a => a.severity === "medium").length,
                        low: filtered.filter(a => a.severity === "low").length,
                    },
                    byCategory: {
                        anomaly: filtered.filter(a => a.category === "anomaly").length,
                        security: filtered.filter(a => a.category === "security").length,
                        system: filtered.filter(a => a.category === "system").length,
                    },
                },
                topDevices: topDevices.map(d => ({
                    deviceName: d.name,
                    alertCount: d.count,
                    avgRiskScore: d.critical > 0 ? 0.9 : 0.3,
                })),
                criticalIncidents: filtered
                    .filter(a => a.severity === "critical")
                    .slice(0, 10)
                    .map(a => ({
                        id: a.alert_id || a.id,
                        deviceName: a.device_name || "Unknown",
                        severity: a.severity,
                        description: typeof a.explanation_json === 'object' ? JSON.stringify(a.explanation_json).substring(0, 100) : a.title,
                        timestamp: new Date(a.created_at),
                    })),
                mlPerformance: {
                    modelVersion: "1.0.0",
                    accuracy: 0.95,
                    precision: 0.92,
                    recall: 0.88,
                    f1Score: 0.90,
                },
            };

            const blob = await pdfService.generateReport(reportData, chartImages);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `alert-analysis-${dateRange}-${now.toISOString().split('T')[0]}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('PDF report exported successfully');
        } catch (error) {
            console.error('PDF export failed:', error);
            toast.error('Failed to export PDF report');
        } finally {
            setExporting(false);
        }
    };

    const exportCSV = () => {
        try {
            setExporting(true);
            setExportFormat("csv");

            // Extract SHAP features for CSV
            const alertsWithShap = filtered.filter(a => a.explanation_json && typeof a.explanation_json === 'object' && 'features' in a.explanation_json);
            const shapFeatures = alertsWithShap.flatMap((a) => {
                const features = (a.explanation_json as { features?: Array<{ feature_name: string; attribution_score: number; contribution_type: string }> }).features || [];
                return features.map(f => ({
                    alert_id: a.alert_id || a.id,
                    feature_name: f.feature_name,
                    attribution_score: f.attribution_score,
                    contribution_type: f.contribution_type,
                }));
            });

            const rows = [
                ["EdgePulse Alert Analysis Report"],
                [`Period: ${dateRange}`],
                [`Generated: ${new Date().toISOString()}`],
                [""],
                ["METRICS"],
                [`Total Alerts,${metrics.total}`],
                [`Critical Alerts,${metrics.critical}`],
                [`Pending Alerts,${metrics.pending}`],
                [`Resolved Alerts,${metrics.closed}`],
                [`Resolution Rate,${metrics.resolutionRate}%`],
                [`Avg Latency,${metrics.avgLatency}ms`],
                [""],
                ["ALERTS"],
                ["ID", "Title", "Device", "Severity", "Status", "Category", "Source", "Anomaly Score", "Latency (ms)", "Created"],
                ...filtered.map(a => [
                    a.id, `"${a.title}"`, a.device_name || "", a.severity,
                    a.status, a.category || "", a.telemetry_source || "",
                    ((a.anomaly_score ?? 0) * 100).toFixed(1) + "%",
                    a.inference_latency_ms,
                    new Date(a.created_at).toISOString(),
                ]),
                [""],
                ["SHAP FEATURE IMPORTANCE"],
                ["Alert ID", "Feature Name", "Attribution Score", "Contribution Type"],
                ...shapFeatures.map(f => [
                    f.alert_id, f.feature_name, f.attribution_score.toFixed(4), f.contribution_type,
                ]),
            ];
            const csv = rows.map(r => r.join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `alert-analysis-${dateRange}-${new Date().toISOString().split("T")[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('CSV report exported successfully');
            setTimeout(() => setExporting(false), 800);
        } catch (error) {
            console.error('CSV export failed:', error);
            toast.error('Failed to export CSV report');
            setExporting(false);
        }
    };

    const RANGE_OPTS: { label: string; value: DateRange }[] = [
        { label: "7 days", value: "7d" }, { label: "30 days", value: "30d" },
        { label: "90 days", value: "90d" }, { label: "All time", value: "all" },
    ];

    return (
        <div className="max-w-[1200px] space-y-6">
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/dashboard/reports")}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
                            <ShieldAlert className="h-5 w-5 text-destructive" />
                            Alert Analysis
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">Security alert trends, distribution, and performance metrics</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExportPDF} disabled={exporting}>
                        {exporting && exportFormat === "pdf" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        Export PDF
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={exportCSV} disabled={exporting}>
                        {exporting && exportFormat === "csv" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        Export CSV
                    </Button>
                </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                        {RANGE_OPTS.map(o => (
                            <button key={o.value} onClick={() => setDateRange(o.value)}
                                className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                                    dateRange === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                                {o.label}
                            </button>
                        ))}
                    </div>
                    <Select value={severity} onValueChange={(v) => setSeverity(v as SeverityFilter)}>
                        <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All severities</SelectItem>
                            {["critical", "high", "medium", "low"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                        <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            {["PENDING", "ACKNOWLEDGED", "INVESTIGATED", "CLOSED"].map(s => <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={source} onValueChange={(v) => setSource(v as SourceFilter)}>
                        <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All sources</SelectItem>
                            {["PROCESS", "NETWORK", "FILE", "RESOURCE"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                        <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All devices" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All devices</SelectItem>
                            {uniqueDevices.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <div className="relative flex-1 min-w-[160px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input placeholder="Search alerts..." className="pl-8 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                </div>
            </motion.div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                    { label: "Total Alerts", value: metrics.total, color: "text-foreground" },
                    { label: "Critical", value: metrics.critical, color: "text-destructive" },
                    { label: "Pending", value: metrics.pending, color: "text-amber-500" },
                    { label: "Resolved", value: metrics.closed, color: "text-green-500" },
                    { label: "Resolution Rate", value: `${metrics.resolutionRate}%`, color: "text-primary" },
                    { label: "Avg Latency", value: `${metrics.avgLatency}ms`, color: "text-violet-500" },
                ].map((s, i) => (
                    <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.04 }}
                        className="bg-card border border-border rounded-xl p-3.5">
                        <p className={`text-xl font-bold font-display ${s.color}`}>{s.value}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    className="xl:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            Alert Trend by Severity
                        </h3>
                        <span className="text-xs text-muted-foreground">{filtered.length} alerts</span>
                    </div>
                    <div id="alert-trends-chart" className="p-4 h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={timeSeries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <defs>
                                    {["critical", "high", "medium", "low"].map(sev => (
                                        <linearGradient key={sev} id={`g-${sev}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={SEV_COLORS[sev]} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={SEV_COLORS[sev]} stopOpacity={0} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip content={<TooltipBox />} />
                                {["critical", "high", "medium", "low"].map(sev => (
                                    <Area key={sev} type="monotone" dataKey={sev} name={sev.charAt(0).toUpperCase() + sev.slice(1)}
                                        stroke={SEV_COLORS[sev]} strokeWidth={1.5} fill={`url(#g-${sev})`} dot={false} />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border">
                        <h3 className="text-sm font-semibold text-foreground">Severity Distribution</h3>
                    </div>
                    <div id="severity-distribution-chart" className="p-4 h-56 flex items-center">
                        {severityDist.length > 0 ? (
                            <>
                                <div className="flex-1 h-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={severityDist} cx="50%" cy="50%" innerRadius="50%" outerRadius="80%" paddingAngle={3} dataKey="value" strokeWidth={0}>
                                                {severityDist.map((e, i) => <Cell key={i} fill={e.color} />)}
                                            </Pie>
                                            <Tooltip formatter={(v) => [typeof v === "number" ? v : 0, "Alerts"]} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-col gap-2 pl-2">
                                    {severityDist.map(d => (
                                        <div key={d.name} className="flex items-center gap-2 text-xs">
                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                                            <span className="text-muted-foreground capitalize w-14">{d.name}</span>
                                            <span className="font-bold text-foreground">{d.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center"><p className="text-xs text-muted-foreground">No data</p></div>
                        )}
                    </div>
                </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border">
                        <h3 className="text-sm font-semibold text-foreground">Top Devices by Alert Count</h3>
                    </div>
                    <div className="p-4 h-52">
                        {topDevices.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={topDevices} layout="vertical" margin={{ left: 0, right: 16 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={80} />
                                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                                    <Bar dataKey="count" name="Alerts" fill="#06b6d4" radius={[0, 4, 4, 0]} maxBarSize={16} />
                                    <Bar dataKey="critical" name="Critical" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={16} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center"><p className="text-xs text-muted-foreground">No data</p></div>
                        )}
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border">
                        <h3 className="text-sm font-semibold text-foreground">Status Distribution</h3>
                    </div>
                    <div id="status-distribution-chart" className="p-4 h-52 flex items-center">
                        {statusDist.length > 0 ? (
                            <>
                                <div className="flex-1 h-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={statusDist} cx="50%" cy="50%" innerRadius="45%" outerRadius="75%" paddingAngle={3} dataKey="value" strokeWidth={0}>
                                                {statusDist.map((e, i) => <Cell key={i} fill={e.color} />)}
                                            </Pie>
                                            <Tooltip formatter={(v) => [typeof v === "number" ? v : 0, "Alerts"]} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {statusDist.map(d => (
                                        <div key={d.name} className="flex items-center gap-2 text-xs">
                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                                            <span className="text-muted-foreground w-20">{d.name}</span>
                                            <span className="font-bold text-foreground">{d.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : <div className="flex-1 flex items-center justify-center"><p className="text-xs text-muted-foreground">No data</p></div>}
                    </div>
                </motion.div>
            </div>

            {categoryDist.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border">
                        <h3 className="text-sm font-semibold text-foreground">Category Breakdown</h3>
                    </div>
                    <div className="p-4 h-44">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={categoryDist} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                                <Bar dataKey="value" name="Alerts" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                    {categoryDist.map((_, i) => <Cell key={i} fill={["#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444", "#22c55e", "#f97316"][i % 6]} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>
            )}

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Alert Records</h3>
                    <span className="text-xs text-muted-foreground">Showing {Math.min(filtered.length, 100)} of {filtered.length}</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-border bg-muted/30">
                                {["Title", "Device", "Severity", "Status", "Source", "Score", "Created", "Actions"].map(h => (
                                    <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filtered.slice(0, 100).map(a => {
                                const sevColors: Record<string, string> = {
                                    critical: "text-destructive bg-destructive/10",
                                    high: "text-orange-500 bg-orange-500/10",
                                    medium: "text-amber-500 bg-amber-500/10",
                                    low: "text-primary bg-primary/10",
                                };
                                return (
                                    <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-2.5 font-medium text-foreground max-w-[200px] truncate">{a.title}</td>
                                        <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[120px]">{a.device_name}</td>
                                        <td className="px-4 py-2.5">
                                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold capitalize", sevColors[a.severity])}>{a.severity}</span>
                                        </td>
                                        <td className="px-4 py-2.5 text-muted-foreground">{a.status.charAt(0) + a.status.slice(1).toLowerCase()}</td>
                                        <td className="px-4 py-2.5">
                                            <span className="flex items-center gap-1 text-muted-foreground">{telemetrySourceIcon(a.telemetry_source)}{a.telemetry_source}</span>
                                        </td>
                                        <td className="px-4 py-2.5 font-mono text-foreground">{((a.anomaly_score ?? 0) * 100).toFixed(0)}%</td>
                                        <td className="px-4 py-2.5 text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</td>
                                        <td className="px-4 py-2.5">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 w-7 p-0"
                                                onClick={() => handleExportAlertPDF(a)}
                                                disabled={exporting}
                                            >
                                                <Download className="h-3.5 w-3.5" />
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filtered.length === 0 && (
                        <div className="py-12 text-center">
                            <ShieldAlert className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">No alerts match your filters</p>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
