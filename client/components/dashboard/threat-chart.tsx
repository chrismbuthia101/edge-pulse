"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { useAlertStore } from "@/stores/alert-store";

// Static fallback datasets
const DATASETS = {
    "24h": {
        data: [2, 1, 0, 1, 0, 0, 3, 8, 12, 15, 18, 22, 19, 14, 16, 21, 25, 18, 12, 9, 7, 5, 4, 3],
        labels: Array.from({ length: 24 }, (_, i) => {
            const h = i % 12 === 0 ? 12 : i % 12;
            const ampm = i < 12 ? "am" : "pm";
            return i % 6 === 0 ? `${h}${ampm}` : "";
        }),
        total: 89,
        peak: "5pm",
        delta: "+23%",
        deltaLabel: "vs yesterday",
    },
    "7d": {
        data: [23, 41, 18, 56, 34, 12, 8],
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        total: 192,
        peak: "Thursday",
        delta: "+12%",
        deltaLabel: "vs last week",
    },
    "30d": {
        data: [
            45, 62, 38, 71, 55, 48, 33, 29, 84, 91, 67, 53, 41, 38, 62, 77, 85, 64,
            52, 43, 39, 56, 71, 68, 54, 47, 83, 92, 75, 61,
        ],
        labels: Array.from({ length: 30 }, (_, i) =>
            (i + 1) % 5 === 0 ? `Day ${i + 1}` : ""
        ),
        total: 1842,
        peak: "Day 29",
        delta: "+8%",
        deltaLabel: "vs last month",
    },
};

type TabKey = "24h" | "7d" | "30d";

export function ThreatChart() {
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

    // Build live 24h dataset from store alerts
    const liveDataset = useMemo(() => {
        if (alerts.length === 0) return null;
        const buckets = new Array(24).fill(0);
        alerts.forEach((a) => {
            const diffH = Math.floor((currentTime - new Date(a.created_at).getTime()) / 3600000);
            if (diffH >= 0 && diffH < 24) {
                buckets[23 - diffH]++;
            }
        });
        const total = buckets.reduce((s, v) => s + v, 0);
        return { ...DATASETS["24h"], data: buckets, total: total || DATASETS["24h"].total };
    }, [alerts, currentTime]);

    const dataset = activeTab === "24h" && liveDataset ? liveDataset : DATASETS[activeTab];
    const maxVal = Math.max(...dataset.data, 1);

    // Weekly summary always shown at bottom
    const weeklyData = DATASETS["7d"].data;
    const weeklyMax = Math.max(...weeklyData);
    const weekDays = DATASETS["7d"].labels;

    return (
        <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Threat Activity</h3>
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
                            {dataset.total.toLocaleString()} threats
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {activeTab === "24h" ? "Detected today" : activeTab === "7d" ? "This week" : "This month"} ·
                            Peak at {dataset.peak}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className={`text-sm font-semibold ${dataset.delta.startsWith("+") ? "text-destructive" : "text-green-500"}`}>
                            {dataset.delta}
                        </p>
                        <p className="text-xs text-muted-foreground">{dataset.deltaLabel}</p>
                    </div>
                </div>

                {/* Bar chart */}
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
                                        title={`${day}: ${weeklyData[i]} threats`}
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