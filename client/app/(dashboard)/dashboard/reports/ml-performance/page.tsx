"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
    Brain,
    TrendingUp,
    Zap,
    Activity,
    Download,
    Calendar,
    BarChart3,
    ArrowLeft,
    Loader2,
    Target,
    Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/useAuth";
import { useAlertStore } from "@/lib/stores/alert-store";
import { toast } from "sonner";

export default function MLPerformanceReportPage() {
    const { hasRole, loading } = useAuth();
    const { alerts, initialize: initAlerts } = useAlertStore();

    const [dateRange, setDateRange] = useState("7d");
    const [loadingData, setLoadingData] = useState(true);
    const [modelMetrics, setModelMetrics] = useState({
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        avgInferenceTime: 0,
        totalInferences: 0,
        anomalyThreshold: 0.75,
    });
    const [shapFeatures, setShapFeatures] = useState<Array<{
        feature_name: string;
        attribution_score: number;
        contribution_type: string;
    }>>([]);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoadingData(true);
                await initAlerts();
            } catch (error) {
                console.error("Failed to load data:", error);
                toast.error("Failed to load report data");
            } finally {
                setLoadingData(false);
            }
        };
        loadData();
    }, [initAlerts]);

    useEffect(() => {
        const totalAlerts = alerts.length;
        const avgLatency = alerts.length > 0
            ? alerts.reduce((sum, a) => sum + (a.inference_latency_ms || 0), 0) / alerts.length
            : 0;

        // Extract SHAP features from alerts with explanation_json
        const alertsWithShap = alerts.filter(a => a.explanation_json && a.explanation_json.features);
        if (alertsWithShap.length > 0) {
            const allFeatures = alertsWithShap.flatMap(a => a.explanation_json?.features || []);
            const aggregatedFeatures = allFeatures.reduce((acc, feature) => {
                const existing = acc.find(f => f.feature_name === feature.feature_name);
                if (existing) {
                    existing.attribution_score += Math.abs(feature.attribution_score);
                } else {
                    acc.push({
                        feature_name: feature.feature_name,
                        attribution_score: Math.abs(feature.attribution_score),
                        contribution_type: feature.contribution_type,
                    });
                }
                return acc;
            }, [] as typeof shapFeatures);

            setShapFeatures(
                aggregatedFeatures
                    .map(f => ({
                        ...f,
                        attribution_score: f.attribution_score / alertsWithShap.length,
                    }))
                    .sort((a, b) => b.attribution_score - a.attribution_score)
                    .slice(0, 10)
            );
        }

        setModelMetrics({
            accuracy: 0.95, // Placeholder - would come from actual model metrics
            precision: 0.92,
            recall: 0.88,
            f1Score: 0.90,
            avgInferenceTime: avgLatency,
            totalInferences: totalAlerts,
            anomalyThreshold: 0.75,
        });
    }, [alerts]);

    const highConfidenceAlerts = alerts.filter(a => a.anomaly_score > 0.8).length;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!hasRole(["ADMINISTRATOR"])) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold">Access Denied</h3>
                    <p className="text-muted-foreground">This report is available to administrators only.</p>
                </div>
            </div>
        );
    }

    if (loadingData) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/reports">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-display font-bold text-foreground">ML Performance Report</h1>
                            <p className="text-muted-foreground">Model accuracy metrics, SHAP feature importance, and detection performance</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-2" />
                            Export PDF
                        </Button>
                        <Button variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-2" />
                            Export CSV
                        </Button>
                    </div>
                </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <Select value={dateRange} onValueChange={setDateRange}>
                                <SelectTrigger className="w-40">
                                    <SelectValue />
                                </SelectTrigger>
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

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Model Accuracy</CardTitle>
                        <Target className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">{(modelMetrics.accuracy * 100).toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">Detection accuracy</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Precision</CardTitle>
                        <BarChart3 className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-500">{(modelMetrics.precision * 100).toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">True positive rate</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Recall</CardTitle>
                        <Activity className="h-4 w-4 text-violet-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-violet-500">{(modelMetrics.recall * 100).toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">Sensitivity</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">F1 Score</CardTitle>
                        <TrendingUp className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-500">{(modelMetrics.f1Score * 100).toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">Harmonic mean</p>
                    </CardContent>
                </Card>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Brain className="h-5 w-5" />
                                SHAP Feature Importance
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {shapFeatures.length > 0 ? shapFeatures.map((feature, index) => (
                                    <div key={index} className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="font-medium">{feature.feature_name}</span>
                                            <span className={`font-mono ${feature.contribution_type === "positive" ? "text-red-500" : "text-green-500"
                                                }`}>
                                                {feature.attribution_score.toFixed(3)}
                                            </span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${(feature.attribution_score / (shapFeatures[0]?.attribution_score || 1)) * 100}%` }}
                                                transition={{ duration: 0.5, delay: index * 0.05 }}
                                                className={`h-full rounded-full ${feature.contribution_type === "positive" ? "bg-red-500" : "bg-green-500"
                                                    }`}
                                            />
                                        </div>
                                    </div>
                                )) : (
                                    <p className="text-sm text-muted-foreground text-center py-4">No SHAP data available</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Zap className="h-5 w-5" />
                                Inference Performance
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Cpu className="h-5 w-5 text-blue-500" />
                                    <div>
                                        <div className="text-sm font-medium">Avg Inference Time</div>
                                        <div className="text-xs text-muted-foreground">Per detection</div>
                                    </div>
                                </div>
                                <div className="text-2xl font-bold">{modelMetrics.avgInferenceTime.toFixed(1)}ms</div>
                            </div>
                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Activity className="h-5 w-5 text-green-500" />
                                    <div>
                                        <div className="text-sm font-medium">Total Inferences</div>
                                        <div className="text-xs text-muted-foreground">In selected period</div>
                                    </div>
                                </div>
                                <div className="text-2xl font-bold">{modelMetrics.totalInferences}</div>
                            </div>
                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Target className="h-5 w-5 text-amber-500" />
                                    <div>
                                        <div className="text-sm font-medium">Anomaly Threshold</div>
                                        <div className="text-xs text-muted-foreground">Detection cutoff</div>
                                    </div>
                                </div>
                                <div className="text-2xl font-bold">{modelMetrics.anomalyThreshold.toFixed(2)}</div>
                            </div>
                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Zap className="h-5 w-5 text-violet-500" />
                                    <div>
                                        <div className="text-sm font-medium">High Confidence Detections</div>
                                        <div className="text-xs text-muted-foreground">Score &gt; 0.8</div>
                                    </div>
                                </div>
                                <div className="text-2xl font-bold">{highConfidenceAlerts}</div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            Detection Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 border rounded-lg bg-green-500/5 border-green-500/20">
                                <div className="text-3xl font-bold text-green-500 mb-2">
                                    {alerts.filter(a => a.anomaly_score <= modelMetrics.anomalyThreshold).length}
                                </div>
                                <div className="text-sm font-medium">Normal</div>
                                <div className="text-xs text-muted-foreground">
                                    Score ≤ {modelMetrics.anomalyThreshold.toFixed(2)}
                                </div>
                            </div>
                            <div className="p-4 border rounded-lg bg-amber-500/5 border-amber-500/20">
                                <div className="text-3xl font-bold text-amber-500 mb-2">
                                    {alerts.filter(a => a.anomaly_score > modelMetrics.anomalyThreshold && a.anomaly_score <= 0.8).length}
                                </div>
                                <div className="text-sm font-medium">Suspicious</div>
                                <div className="text-xs text-muted-foreground">
                                    {modelMetrics.anomalyThreshold.toFixed(2)} &lt; Score ≤ 0.8
                                </div>
                            </div>
                            <div className="p-4 border rounded-lg bg-red-500/5 border-red-500/20">
                                <div className="text-3xl font-bold text-red-500 mb-2">{highConfidenceAlerts}</div>
                                <div className="text-sm font-medium">High Confidence</div>
                                <div className="text-xs text-muted-foreground">Score &gt; 0.8</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Brain className="h-5 w-5" />
                            Model Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <div className="text-xs text-muted-foreground mb-1">Model Type</div>
                                <div className="text-sm font-medium">Isolation Forest</div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground mb-1">Feature Vector Size</div>
                                <div className="text-sm font-medium">47 dimensions</div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground mb-1">Training Window</div>
                                <div className="text-sm font-medium">30 days</div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground mb-1">Last Retrained</div>
                                <div className="text-sm font-medium">7 days ago</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}
