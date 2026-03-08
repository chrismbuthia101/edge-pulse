"use client";

import { motion } from "framer-motion";
import { Zap, Download, RefreshCw, ScanLine, Shield, Bell } from "lucide-react";

const actions = [
    { icon: ScanLine, label: "Run Scan", desc: "Full fleet scan", color: "text-primary", bg: "bg-primary/10", border: "border-primary/20" },
    { icon: RefreshCw, label: "Sync Models", desc: "Update ML agents", color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/20" },
    { icon: Download, label: "Export Report", desc: "PDF / CSV", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
    { icon: Bell, label: "Alert Rules", desc: "Configure alerts", color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20" },
    { icon: Shield, label: "Block Threat", desc: "Manual isolation", color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20" },
];

export function QuickActions() {
    return (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
                <Zap className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
            </div>
            <div className="p-4 grid grid-cols-1 gap-2">
                {actions.map((action, i) => (
                    <motion.button
                        key={action.label}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.06 }}
                        whileHover={{ x: 4 }}
                        whileTap={{ scale: 0.98 }}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-sm text-left ${action.bg} ${action.border}`}
                    >
                        <div className={`w-8 h-8 rounded-lg ${action.bg} border ${action.border} flex items-center justify-center shrink-0`}>
                            <action.icon className={`h-4 w-4 ${action.color}`} />
                        </div>
                        <div>
                            <p className={`text-sm font-semibold ${action.color}`}>{action.label}</p>
                            <p className="text-xs text-muted-foreground">{action.desc}</p>
                        </div>
                    </motion.button>
                ))}
            </div>
        </div>
    );
}