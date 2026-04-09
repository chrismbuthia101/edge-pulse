"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Brain, Info } from "lucide-react";
import { useAlertStore } from "@/stores/alert-store";
import type { Alert, ShapFeature } from "@/lib/supabase/types";

export function ShapPanel() {
    const alerts = useAlertStore((s) => s.alerts);
    const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

    const latestAlertWithShap = useMemo(() => {
        return alerts
            .filter(a => a.explanation_json && a.explanation_json.features)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
    }, [alerts]);

    useEffect(() => {
        setSelectedAlert(latestAlertWithShap);
    }, [latestAlertWithShap]);

    const features = useMemo(() => {
        if (!selectedAlert?.explanation_json?.features) return [];

        return selectedAlert.explanation_json.features
            .slice(0, 6)
            .map((f: ShapFeature) => ({
                label: f.feature_name,
                value: f.attribution_score,
                raw: `${f.contribution_type === 'positive' ? '+' : '-'}${Math.abs(f.attribution_score).toFixed(2)}`,
                positive: f.contribution_type === 'positive',
            }));
    }, [selectedAlert]);

    const maxAbs = useMemo(() => {
        return features.length > 0 ? Math.max(...features.map((f) => Math.abs(f.value))) : 1;
    }, [features]);

    const anomalyScore = selectedAlert?.anomaly_score || 0;
    const baseScore = selectedAlert?.explanation_json?.base_score || 0.1;
    const scoreDelta = anomalyScore - baseScore;
    const deviceName = selectedAlert?.device_name || 'No data';

    if (!selectedAlert) {
        return (
            <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <Brain className="h-4 w-4 text-violet-500 shrink-0" />
                        <h3 className="text-sm font-semibold text-foreground truncate">SHAP Explainability</h3>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs text-muted-foreground truncate">No data available</span>
                    </div>
                </div>

                <div className="px-4 lg:px-5 py-8">
                    <div className="text-center text-muted-foreground">
                        <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">No SHAP data available</p>
                        <p className="text-xs mt-1">Waiting for alerts with explainability data</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Brain className="h-4 w-4 text-violet-500 shrink-0" />
                    <h3 className="text-sm font-semibold text-foreground truncate">SHAP Explainability</h3>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs text-muted-foreground truncate">{deviceName}</span>
                    <button className="text-muted-foreground hover:text-foreground shrink-0">
                        <Info className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            <div className="px-4 lg:px-5 py-4">
                {/* Score summary */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-5 p-3 bg-destructive/8 border border-destructive/15 rounded-xl">
                    <div className="min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">Anomaly Score</p>
                        <p className="text-xl lg:text-2xl font-bold font-mono text-destructive">
                            {anomalyScore.toFixed(2)}
                        </p>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Base rate: {baseScore.toFixed(2)}</span>
                            <span className="text-destructive font-medium">
                                Δ {scoreDelta > 0 ? '+' : ''}{scoreDelta.toFixed(2)}
                            </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-linear-to-r from-amber-500 to-destructive rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(anomalyScore * 100, 100)}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                            />
                        </div>
                    </div>
                </div>

                {/* Feature bars */}
                <div className="space-y-2.5">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                        Feature Contributions
                    </p>
                    {features.map((feat, i) => {
                        const width = `${(Math.abs(feat.value) / maxAbs) * 100}%`;
                        return (
                            <div key={feat.label} className="flex items-center gap-2 lg:gap-3">
                                <p className="text-xs text-muted-foreground w-28 lg:w-36 shrink-0 truncate" title={feat.label}>
                                    {feat.label}
                                </p>
                                <div className="flex-1 flex items-center gap-2 min-w-0">
                                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                        <motion.div
                                            className={`h-full rounded-full ${feat.positive ? "bg-destructive" : "bg-primary"}`}
                                            initial={{ width: 0 }}
                                            animate={{ width }}
                                            transition={{ delay: 0.1 + i * 0.07, duration: 0.5, ease: "easeOut" }}
                                        />
                                    </div>
                                    <span
                                        className={`text-xs font-mono font-bold w-10 text-right shrink-0 ${feat.positive ? "text-destructive" : "text-primary"
                                            }`}
                                    >
                                        {feat.raw}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Legend */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-4 pt-4 border-t border-border">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="w-3 h-2 rounded-full bg-destructive" />
                        Increases risk
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="w-3 h-2 rounded-full bg-primary" />
                        Decreases risk
                    </div>
                </div>
            </div>
        </div>
    );
}