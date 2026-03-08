"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
    title: string;
    value: string;
    delta?: string;
    deltaPositive?: boolean;
    icon: LucideIcon;
    accent?: string;
    accentBg?: string;
    accentBorder?: string;
    chart?: number[];
    index?: number;
}

export function StatCard({
    title,
    value,
    delta,
    deltaPositive,
    icon: Icon,
    accent = "text-primary",
    accentBg = "bg-primary/10",
    accentBorder = "border-primary/20",
    chart,
    index = 0,
}: StatCardProps) {
    const maxVal = chart ? Math.max(...chart) : 1;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.07, duration: 0.4 }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className="bg-card border border-border rounded-2xl p-5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-shadow"
        >
            <div className="flex items-start justify-between mb-4">
                <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center", accentBg, accentBorder)}>
                    <Icon className={cn("h-5 w-5", accent)} />
                </div>
                {delta && (
                    <span
                        className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            deltaPositive
                                ? "text-green-600 dark:text-green-400 bg-green-500/10"
                                : "text-destructive bg-destructive/10"
                        )}
                    >
                        {delta}
                    </span>
                )}
            </div>

            <p className="text-2xl font-bold font-display text-foreground mb-0.5">{value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>

            {chart && (
                <div className="flex items-end gap-0.5 mt-4 h-10">
                    {chart.map((v, i) => (
                        <motion.div
                            key={i}
                            className={cn("flex-1 rounded-t-sm", accentBg)}
                            initial={{ height: 0 }}
                            animate={{ height: `${(v / maxVal) * 100}%` }}
                            transition={{ delay: index * 0.07 + i * 0.04, duration: 0.4, ease: "easeOut" }}
                        />
                    ))}
                </div>
            )}
        </motion.div>
    );
}