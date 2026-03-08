"use client";

import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";

// 24h threat data (hourly)
const hourlyData = [2, 1, 0, 1, 0, 0, 3, 8, 12, 15, 18, 22, 19, 14, 16, 21, 25, 18, 12, 9, 7, 5, 4, 3];
const maxVal = Math.max(...hourlyData);

const hours = Array.from({ length: 24 }, (_, i) => {
    const h = i % 12 === 0 ? 12 : i % 12;
    const ampm = i < 12 ? "am" : "pm";
    return i % 6 === 0 ? `${h}${ampm}` : "";
});

// Weekly summary
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weeklyAlerts = [23, 41, 18, 56, 34, 12, 8];
const weeklyMax = Math.max(...weeklyAlerts);

export function ThreatChart() {
    return (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Threat Activity</h3>
                </div>
                <div className="flex items-center gap-2">
                    <button className="text-xs px-2.5 py-1 rounded-md bg-primary/10 text-primary font-medium">24h</button>
                    <button className="text-xs px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground transition-colors">7d</button>
                    <button className="text-xs px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground transition-colors">30d</button>
                </div>
            </div>

            <div className="px-5 pt-5 pb-4">
                {/* Peak indicator */}
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <p className="text-xl font-bold font-display text-foreground">89 threats</p>
                        <p className="text-xs text-muted-foreground">Detected today · Peak at 5pm</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-semibold text-destructive">↑ 23%</p>
                        <p className="text-xs text-muted-foreground">vs yesterday</p>
                    </div>
                </div>

                {/* 24h bar chart */}
                <div className="relative">
                    <div className="flex items-end gap-0.5 h-20">
                        {hourlyData.map((val, i) => {
                            const pct = (val / maxVal) * 100;
                            const isHigh = val > maxVal * 0.6;
                            const isMed = val > maxVal * 0.3;
                            const barColor = isHigh ? "bg-destructive" : isMed ? "bg-orange-500" : "bg-primary/60";

                            return (
                                <div key={i} className="flex-1 flex flex-col justify-end group relative">
                                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] font-mono px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                        {val}
                                    </div>
                                    <motion.div
                                        className={`rounded-t-sm ${barColor}`}
                                        initial={{ height: 0 }}
                                        animate={{ height: `${pct}%` }}
                                        transition={{ delay: 0.3 + i * 0.02, duration: 0.4, ease: "easeOut" }}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* Hour labels */}
                    <div className="flex mt-1">
                        {hours.map((h, i) => (
                            <div key={i} className="flex-1 text-center">
                                <span className="text-[9px] text-muted-foreground/60 font-mono">{h}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Weekly mini bars */}
                <div className="mt-5 pt-4 border-t border-border">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                        7-Day Summary
                    </p>
                    <div className="flex items-end gap-2">
                        {weekDays.map((day, i) => (
                            <div key={day} className="flex-1 flex flex-col items-center gap-1">
                                <motion.div
                                    className="w-full rounded-sm bg-primary/40 hover:bg-primary/70 transition-colors cursor-pointer"
                                    style={{ height: `${(weeklyAlerts[i] / weeklyMax) * 32}px` }}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${(weeklyAlerts[i] / weeklyMax) * 32}px` }}
                                    transition={{ delay: 0.5 + i * 0.06, duration: 0.4 }}
                                />
                                <span className="text-[9px] text-muted-foreground font-medium">{day}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}