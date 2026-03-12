"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Brain,
    Zap,
    BarChart3,
    RefreshCw,
    Download,
    Info,
    CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const modelStats = [
    { label: "Model Version", value: "v2.4.1", sub: "Released 3 days ago", color: "text-primary" },
    { label: "Detection Accuracy", value: "99.9%", sub: "On validation set", color: "text-green-500" },
    { label: "False Positive Rate", value: "0.04%", sub: "Last 7 days", color: "text-amber-500" },
    { label: "Avg Inference Time", value: "12ms", sub: "Edge latency", color: "text-violet-500" },
];

const topFeatures = [
    { label: "CPU Spike Pattern", importance: 0.34, positive: true, description: "Sudden CPU utilization spikes correlating with process anomalies" },
    { label: "Network Anomaly Score", importance: 0.28, positive: true, description: "Unusual outbound connection patterns and volume deviations" },
    { label: "Disk I/O Burst", importance: 0.19, positive: true, description: "Rapid sequential read/write operations outside normal baseline" },
    { label: "Process Hierarchy Depth", importance: 0.11, positive: true, description: "Unusual parent-child process relationships detected" },
    { label: "Memory Footprint Delta", importance: 0.06, positive: false, description: "Memory usage within normal operational range" },
    { label: "Login History Score", importance: 0.04, positive: false, description: "Authentication patterns consistent with known user behavior" },
];

const recentDetections = [
    { device: "dev-laptop-07", score: 0.97, label: "Process Injection", time: "2m ago", blocked: true },
    { device: "srv-db-02", score: 0.95, label: "Privilege Escalation", time: "22m ago", blocked: true },
    { device: "srv-prod-01", score: 0.91, label: "Data Exfiltration", time: "8m ago", blocked: true },
    { device: "ws-finance-03", score: 0.88, label: "Brute Force", time: "15m ago", blocked: true },
    { device: "gw-primary", score: 0.82, label: "Port Scan", time: "34m ago", blocked: false },
];

const modelHistory = [
    { version: "v2.4.1", date: "3 days ago", accuracy: "99.9%", status: "active" },
    { version: "v2.4.0", date: "2 weeks ago", accuracy: "99.7%", status: "previous" },
    { version: "v2.3.9", date: "1 month ago", accuracy: "99.4%", status: "deprecated" },
    { version: "v2.3.8", date: "6 weeks ago", accuracy: "99.1%", status: "deprecated" },
];

const maxImportance = Math.max(...topFeatures.map((f) => f.importance));

export default function InsightsPage() {
    useEffect(() => {
        document.title = "ML Insights - EdgePulse";
    }, []);

    const [selectedFeature, setSelectedFeature] = useState<number | null>(null);

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

                {/* Model History */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden"
                >
                    <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Model Versions</h3>
                    </div>
                    <div className="divide-y divide-border">
                        {modelHistory.map((m) => (
                            <div key={m.version} className="flex items-center justify-between px-5 py-3.5">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-mono font-semibold text-foreground">{m.version}</span>
                                        {m.status === "active" && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20">Active</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">{m.date}</p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-sm font-bold font-mono ${m.status === "active" ? "text-green-500" : "text-muted-foreground"}`}>{m.accuracy}</p>
                                    <p className="text-xs text-muted-foreground capitalize">{m.status}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

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