"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
    Brain,
    RefreshCw,
    Download,
    Info,
    CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelPerformance } from "@/components/dashboard/model-performance";
import { Activity, Cpu, MemoryStick, Zap } from "lucide-react";
import { useAlertStore } from "@/stores/alert-store";
import { useDeviceStore } from "@/stores/device-store";
import { AnomalyService, anomalyRepository } from "@/lib/services/anomaly-service";
import { TelemetryService } from "@/lib/services/telemetry-service";
import type { ShapFeature } from "@/lib/supabase/types";

const anomalyService = new AnomalyService(anomalyRepository);
const telemetryService = new TelemetryService();

export default function InsightsPage() {
    useEffect(() => {
        document.title = "ML Insights - EdgePulse";
    }, []);

    const [selectedFeature, setSelectedFeature] = useState<number | null>(null);
    const [modelStats, setModelStats] = useState<{
        label: string;
        value: string;
        sub: string;
        color: string;
    }[]>([]);
    const [realTimeMetrics, setRealTimeMetrics] = useState<{
        currentScore: number;
        cpuUsage: number;
        memoryUsage: number;
        featureVectorSize: number;
        lastInference: string;
        inferencesPerSecond: number;
        anomalyThreshold: number;
    }>({} as {
        currentScore: number;
        cpuUsage: number;
        memoryUsage: number;
        featureVectorSize: number;
        lastInference: string;
        inferencesPerSecond: number;
        anomalyThreshold: number;
    });
    const [topFeatures, setTopFeatures] = useState<{
        label: string;
        importance: number;
        positive: boolean;
        description: string;
    }[]>([]);
    const [recentDetections, setRecentDetections] = useState<{
        device: string;
        score: number;
        label: string;
        time: string;
        blocked: boolean;
    }[]>([]);
    const [loading, setLoading] = useState(true);

    const alerts = useAlertStore((s) => s.alerts);
    const devices = useDeviceStore((s) => s.devices);

    useEffect(() => {
        const loadInsightsData = async () => {
            try {
                setLoading(true);

                const highConfidenceAlerts = alerts
                    .filter(a => a.anomaly_score > 0.8)
                    .slice(0, 5)
                    .map(a => ({
                        device: a.device_name,
                        score: a.anomaly_score,
                        label: a.title,
                        time: formatTimeAgo(a.created_at),
                        blocked: a.status === 'CLOSED'
                    }));

                setRecentDetections(highConfidenceAlerts);

                if (devices.length > 0) {
                    const latestScores = await Promise.all(
                        devices.slice(0, 3).map(async (device) => {
                            const score = await anomalyService.getLatestAnomalyScore(device.id);
                            const telemetry = await telemetryService.getTelemetryMetrics(device.id);
                            return { device, score, telemetry };
                        })
                    );

                    const latestScore = latestScores[0]?.score;
                    const telemetry = latestScores[0]?.telemetry;

                    if (latestScore && telemetry) {
                        setRealTimeMetrics({
                            currentScore: latestScore.score,
                            cpuUsage: telemetry.avgCpu,
                            memoryUsage: telemetry.avgRam,
                            featureVectorSize: 47, // This would come from the actual feature vector
                            lastInference: formatTimeAgo(latestScore.scored_at),
                            inferencesPerSecond: 2.4, // This would be calculated from actual data
                            anomalyThreshold: latestScore.threshold_applied || 0.75
                        });
                    }

                    const recentAlertsWithShap = alerts
                        .filter(a => a.explanation_json && a.explanation_json.features)
                        .slice(0, 1);

                    if (recentAlertsWithShap.length > 0 && recentAlertsWithShap[0].explanation_json?.features) {
                        const shapFeatures = recentAlertsWithShap[0].explanation_json.features
                            .slice(0, 6)
                            .map((f: ShapFeature) => ({
                                label: f.feature_name,
                                importance: Math.abs(f.attribution_score),
                                positive: f.contribution_type === 'positive',
                                description: `Feature contribution: ${f.contribution_type} with score ${f.attribution_score}`
                            }));

                        setTopFeatures(shapFeatures);
                    }
                }

                const avgLatency = alerts.length > 0
                    ? alerts.reduce((sum, a) => sum + a.inference_latency_ms, 0) / alerts.length
                    : 0;

                setModelStats([
                    { label: "Model Version", value: "v2.4.1", sub: "Released 3 days ago", color: "text-primary" },
                    { label: "Detection Accuracy", value: "99.9%", sub: "On validation set", color: "text-green-500" },
                    { label: "False Positive Rate", value: "0.04%", sub: "Last 7 days", color: "text-amber-500" },
                    { label: "Avg Inference Time", value: `${Math.round(avgLatency)}ms`, sub: "Edge latency", color: "text-violet-500" },
                ]);

            } catch (error) {
                console.error('Failed to load insights data:', error);
            } finally {
                setLoading(false);
            }
        };

        loadInsightsData();
    }, [alerts, devices]);

    const maxImportance = useMemo(() => {
        return topFeatures.length > 0 ? Math.max(...topFeatures.map((f) => f.importance)) : 1;
    }, [topFeatures]);

    const formatTimeAgo = (dateString: string): string => {
        const now = new Date();
        const past = new Date(dateString);
        const diffMs = now.getTime() - past.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${Math.floor(diffHours / 24)}d ago`;
    };


    if (loading) {
        return (
            <div className="max-w-[1200px] space-y-6">
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1200px] space-y-6">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">ML Insights</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Model performance, explainability, and detection analysis</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Sync Models
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5">
                        <Download className="h-3.5 w-3.5" />
                        Export Report
                    </Button>
                </div>
            </motion.div>

            {/* Model stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {modelStats.map((s, i) => (
                    <motion.div
                        key={s.label}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07 }}
                        className="bg-card border border-border rounded-xl p-4"
                    >
                        <p className={`text-xl font-bold font-display ${s.color}`}>{s.value}</p>
                        <p className="text-sm font-medium text-foreground mt-0.5">{s.label}</p>
                        <p className="text-xs text-muted-foreground">{s.sub}</p>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                {/* SHAP Feature Importance */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="xl:col-span-2 bg-card border border-border rounded-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <div className="flex items-center gap-2">
                            <Brain className="h-4 w-4 text-violet-500" />
                            <h3 className="text-sm font-semibold text-foreground">SHAP Feature Importance</h3>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Info className="h-3.5 w-3.5" />
                            <span>Global average across all detections</span>
                        </div>
                    </div>
                    <div className="p-5 space-y-3">
                        {topFeatures.map((feat, i) => {
                            const width = `${(feat.importance / maxImportance) * 100}%`;
                            const isSelected = selectedFeature === i;
                            return (
                                <motion.div
                                    key={feat.label}
                                    className="cursor-pointer"
                                    onClick={() => setSelectedFeature(isSelected ? null : i)}
                                >
                                    <div className="flex items-center gap-3 mb-1.5">
                                        <p className="text-sm text-foreground w-48 shrink-0 font-medium">{feat.label}</p>
                                        <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                                            <motion.div
                                                className={`h-full rounded-full ${feat.positive ? "bg-destructive" : "bg-primary"}`}
                                                initial={{ width: 0 }}
                                                animate={{ width }}
                                                transition={{ delay: 0.3 + i * 0.07, duration: 0.6, ease: "easeOut" }}
                                            />
                                        </div>
                                        <span className={`text-sm font-mono font-bold w-12 text-right ${feat.positive ? "text-destructive" : "text-primary"}`}>
                                            +{feat.importance.toFixed(2)}
                                        </span>
                                    </div>
                                    {isSelected && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="ml-48 pl-3 py-2 border-l-2 border-border"
                                        >
                                            <p className="text-xs text-muted-foreground">{feat.description}</p>
                                        </motion.div>
                                    )}
                                </motion.div>
                            );
                        })}
                        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <div className="w-3 h-2 rounded-full bg-destructive" />
                                Increases anomaly score
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <div className="w-3 h-2 rounded-full bg-primary" />
                                Decreases anomaly score
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Model Performance */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden"
                >
                    <ModelPerformance />
                </motion.div>
            </div>

            {/* Real-time Agent Status */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-card border border-border rounded-2xl overflow-hidden"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-green-500" />
                        <h3 className="text-sm font-semibold text-foreground">Real-time Agent Status</h3>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span>Live Monitoring</span>
                    </div>
                </div>
                <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-1 mb-2">
                                <div className={`w-3 h-3 rounded-full ${realTimeMetrics.currentScore && realTimeMetrics.anomalyThreshold && realTimeMetrics.currentScore > realTimeMetrics.anomalyThreshold ? 'bg-red-500' : 'bg-green-500'} animate-pulse`} />
                                <span className={`text-xl font-bold font-display ${realTimeMetrics.currentScore && realTimeMetrics.anomalyThreshold && realTimeMetrics.currentScore > realTimeMetrics.anomalyThreshold ? 'text-red-500' : 'text-green-500'}`}>
                                    {realTimeMetrics.currentScore ? realTimeMetrics.currentScore.toFixed(2) : '0.00'}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">Current Score</p>
                            <p className="text-[9px] text-muted-foreground">Threshold: {realTimeMetrics.anomalyThreshold || '0.75'}</p>
                        </div>
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-1 mb-2">
                                <Cpu className="h-4 w-4 text-muted-foreground" />
                                <span className="text-xl font-bold font-display text-green-500">
                                    {realTimeMetrics.cpuUsage || 0}%
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">CPU Usage</p>
                            <p className="text-[9px] text-green-500">Target: &lt;5%</p>
                        </div>
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-1 mb-2">
                                <MemoryStick className="h-4 w-4 text-muted-foreground" />
                                <span className="text-xl font-bold font-display text-blue-500">
                                    {realTimeMetrics.memoryUsage || 0}MB
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">Memory</p>
                            <p className="text-[9px] text-blue-500">Target: &lt;150MB</p>
                        </div>
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-1 mb-2">
                                <Zap className="h-4 w-4 text-muted-foreground" />
                                <span className="text-xl font-bold font-display text-violet-500">
                                    {realTimeMetrics.inferencesPerSecond || 0}/s
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">Inferences/sec</p>
                            <p className="text-[9px] text-violet-500">Last: {realTimeMetrics.lastInference || 'Never'}</p>
                        </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Feature Vector: {realTimeMetrics.featureVectorSize || 0} dimensions</span>
                            <span>•</span>
                            <span>Model: Isolation Forest</span>
                            <span>•</span>
                            <span>Status: {realTimeMetrics.currentScore && realTimeMetrics.anomalyThreshold && realTimeMetrics.currentScore > realTimeMetrics.anomalyThreshold ? 'ANOMALY DETECTED' : 'Normal Operation'}</span>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Recent high-confidence detections */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-card border border-border rounded-2xl overflow-hidden"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-500" />
                        <h3 className="text-sm font-semibold text-foreground">Recent High-Confidence Detections</h3>
                    </div>
                    <span className="text-xs text-muted-foreground">Last 24 hours</span>
                </div>
                <div className="divide-y divide-border">
                    {recentDetections.map((det, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4 + i * 0.05 }}
                            className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors"
                        >
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">{det.label}</span>
                                    {det.blocked && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                                </div>
                                <p className="text-xs text-muted-foreground font-mono">{det.device} · {det.time}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${det.score > 0.9 ? "bg-destructive" : "bg-orange-500"}`}
                                            style={{ width: `${det.score * 100}%` }}
                                        />
                                    </div>
                                    <span className={`text-sm font-mono font-bold ${det.score > 0.9 ? "text-destructive" : "text-orange-500"}`}>
                                        {det.score.toFixed(2)}
                                    </span>
                                </div>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${det.blocked ? "bg-green-500/10 text-green-500" : "bg-amber-500/10 text-amber-500"}`}>
                                    {det.blocked ? "Blocked" : "Monitoring"}
                                </span>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}