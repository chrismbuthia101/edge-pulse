"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, AlertTriangle } from "lucide-react";
import { useAlertStore } from "@/stores/alert-store";

type TabKey = "24h" | "7d" | "30d";

function formatHourLabel(hour: number): string {
    const h = hour % 12 === 0 ? 12 : hour % 12;
    const ampm = hour < 12 ? "am" : "pm";
    return `${h}${ampm}`;
}

function getDayName(offset: number): string {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return days[d.getDay()];
}

export function AnomalyChart() {
    const [activeTab, setActiveTab] = useState<TabKey>("24h");
    const alerts = useAlertStore((s) => s.alerts);
    const [currentTime, setCurrentTime] = useState(() => Date.now());

    // Update current time every minute to keep live data fresh
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(Date.now());
        }, 60000);

        return () => clearInterval(timer);
    }, []);

    const dataset24h = useMemo(() => {
        const buckets = new Array(24).fill(0);
        alerts.forEach((a) => {
            const diffH = Math.floor((currentTime - new Date(a.created_at).getTime()) / 3600000);
            if (diffH >= 0 && diffH < 24) {
                buckets[23 - diffH]++;
            }
        });
        const total = buckets.reduce((s, v) => s + v, 0);
        const maxIndex = buckets.indexOf(Math.max(...buckets));
        const peak = maxIndex >= 0 ? formatHourLabel((24 - maxIndex) % 24) : "—";

        return {
            data: buckets,
            labels: Array.from({ length: 24 }, (_, i) =>
                i % 6 === 0 ? formatHourLabel((24 - i) % 24) : ""
            ),
            total,
            peak,
            delta: total > 0 ? "Live" : "—",
            deltaLabel: "Real-time data",
        };
    }, [alerts, currentTime]);

    const dataset7d = useMemo(() => {
        const buckets = new Array(7).fill(0);
        const labels = Array.from({ length: 7 }, (_, i) => getDayName(6 - i));

        alerts.forEach((a) => {
            const diffDays = Math.floor((currentTime - new Date(a.created_at).getTime()) / 86400000);
            if (diffDays >= 0 && diffDays < 7) {
                buckets[6 - diffDays]++;
            }
        });

        const total = buckets.reduce((s, v) => s + v, 0);
        const maxIndex = buckets.indexOf(Math.max(...buckets));
        const peak = maxIndex >= 0 ? labels[maxIndex] : "—";

        return {
            data: buckets,
            labels,
            total,
            peak,
            delta: total > 0 ? "Live" : "—",
            deltaLabel: "Last 7 days",
        };
    }, [alerts, currentTime]);

    const dataset30d = useMemo(() => {
        const buckets = new Array(30).fill(0);

        alerts.forEach((a) => {
            const diffDays = Math.floor((currentTime - new Date(a.created_at).getTime()) / 86400000);
            if (diffDays >= 0 && diffDays < 30) {
                buckets[29 - diffDays]++;
            }
        });

        const total = buckets.reduce((s, v) => s + v, 0);
        const maxIndex = buckets.indexOf(Math.max(...buckets));
        const peak = maxIndex >= 0 ? `Day ${maxIndex + 1}` : "—";

        return {
            data: buckets,
            labels: Array.from({ length: 30 }, (_, i) =>
                (i + 1) % 5 === 0 ? `Day ${i + 1}` : ""
            ),
            total,
            peak,
            delta: total > 0 ? "Live" : "—",
            deltaLabel: "Last 30 days",
        };
    }, [alerts, currentTime]);

    const datasets = {
        "24h": dataset24h,
        "7d": dataset7d,
        "30d": dataset30d,
    };

    const dataset = datasets[activeTab];
    const maxVal = Math.max(...dataset.data, 1);
    const hasData = alerts.length > 0;

    // Weekly summary data (from 7d dataset)
    const weeklyData = dataset7d.data;
    const weeklyMax = Math.max(...weeklyData, 1);
    const weekDays = dataset7d.labels;

    return (
        <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Anomaly Activity</h3>
                </div>
                <div className="flex items-center gap-1">
                    {(["24h", "7d", "30d"] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`text-xs px-2 lg:px-2.5 py-1 rounded-md font-medium transition-all ${activeTab === tab
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-4 lg:px-5 pt-4 lg:pt-5 pb-4">
                {/* Peak indicator */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-4">
                    <div>
                        <p className="text-lg lg:text-xl font-bold font-display text-foreground">
                            {dataset.total.toLocaleString()} anomalies
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {activeTab === "24h" ? "Detected today" : activeTab === "7d" ? "This week" : "This month"} ·
                            Peak at {dataset.peak}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className={`text-sm font-semibold ${dataset.delta === "Live" ? "text-green-500" : "text-muted-foreground"}`}>
                            {dataset.delta}
                        </p>
                        <p className="text-xs text-muted-foreground">{dataset.deltaLabel}</p>
                    </div>
                </div>

                {/* Bar chart or Empty state */}
                {!hasData ? (
                    <div className="h-32 lg:h-40 flex flex-col items-center justify-center text-center">
                        <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mb-2" />
                        <p className="text-sm text-muted-foreground">No anomaly activity detected</p>
                        <p className="text-xs text-muted-foreground/70">Alerts will appear here when detected</p>
                    </div>
                ) : (
                    <div className="relative">
                        <div
                            className={`flex items-end gap-0.5 h-16 lg:h-20 ${dataset.data.length > 10 ? "gap-px" : "gap-1"
                                }`}
                        >
                            {dataset.data.map((val, i) => {
                                const pct = (val / maxVal) * 100;
                                const isHigh = val > maxVal * 0.6;
                                const isMed = val > maxVal * 0.3;
                                const barColor = isHigh
                                    ? "bg-destructive"
                                    : isMed
                                        ? "bg-orange-500"
                                        : "bg-primary/60";

                                return (
                                    <div key={i} className="flex-1 flex flex-col justify-end group relative">
                                        {val > 0 && (
                                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] font-mono px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                                {val}
                                            </div>
                                        )}
                                        <motion.div
                                            key={`${activeTab}-${i}`}
                                            className={`rounded-t-sm ${barColor}`}
                                            initial={{ height: 0 }}
                                            animate={{ height: `${pct}%` }}
                                            transition={{ delay: i * 0.01, duration: 0.35, ease: "easeOut" }}
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        {/* Labels */}
                        <div className="flex mt-1">
                            {dataset.labels.map((label, i) => (
                                <div key={i} className="flex-1 text-center">
                                    <span className="text-[8px] lg:text-[9px] text-muted-foreground/60 font-mono">
                                        {label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Weekly mini bars — always shown unless we're on 7d view */}
                {activeTab !== "7d" && (
                    <div className="mt-4 lg:mt-5 pt-3 lg:pt-4 border-t border-border">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 lg:mb-3">
                            7-Day Summary
                        </p>
                        <div className="flex items-end gap-1.5 lg:gap-2">
                            {weekDays.map((day, i) => (
                                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                                    <motion.div
                                        className="w-full rounded-sm bg-primary/40 hover:bg-primary/70 transition-colors cursor-pointer"
                                        initial={{ height: 0 }}
                                        animate={{
                                            height: `${(weeklyData[i] / weeklyMax) * 24}px`,
                                        }}
                                        transition={{ delay: 0.4 + i * 0.06, duration: 0.4 }}
                                        title={`${day}: ${weeklyData[i]} anomalies`}
                                    />
                                    <span className="text-[8px] lg:text-[9px] text-muted-foreground font-medium">
                                        {day}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}