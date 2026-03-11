"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Wifi, WifiOff, AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { DeviceSyncQueueSummary } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export function SyncQueuePanel() {
    const [summaries, setSummaries] = useState<DeviceSyncQueueSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    const fetchSummaries = async () => {
        setLoading(true);
        // Aggregate sync_queue by device_id joining devices for the name
        const { data, error } = await supabase
            .from("sync_queue")
            .select(`
        device_id,
        status,
        queued_at,
        devices!inner ( name )
      `)
            .in("status", ["PENDING", "FAILED"]);

        if (!error && data) {
            // Build per-device summary client-side
            const map = new Map<string, DeviceSyncQueueSummary>();
            for (const row of data as Array<{
                device_id: string;
                status: string;
                queued_at: string;
                devices: { name: string };
            }>) {
                const existing = map.get(row.device_id) ?? {
                    device_id: row.device_id,
                    device_name: row.devices?.name ?? row.device_id,
                    pending_count: 0,
                    failed_count: 0,
                    oldest_queued_at: null,
                };
                if (row.status === "PENDING") existing.pending_count++;
                if (row.status === "FAILED") existing.failed_count++;
                if (
                    !existing.oldest_queued_at ||
                    row.queued_at < existing.oldest_queued_at
                ) {
                    existing.oldest_queued_at = row.queued_at;
                }
                map.set(row.device_id, existing);
            }
            setSummaries(Array.from(map.values()));
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchSummaries();

        // Subscribe to sync_queue changes
        const channel = supabase
            .channel("sync-queue-panel")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "sync_queue" },
                () => fetchSummaries()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const totalPending = summaries.reduce((s, d) => s + d.pending_count, 0);
    const totalFailed = summaries.reduce((s, d) => s + d.failed_count, 0);

    const relativeTime = (iso: string | null) => {
        if (!iso) return "—";
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return "just now";
        if (m < 60) return `${m}m ago`;
        return `${Math.floor(m / 60)}h ago`;
    };

    return (
        <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-amber-500 shrink-0" />
                    <h3 className="text-sm font-semibold text-foreground">Sync Queue</h3>
                    {(totalPending > 0 || totalFailed > 0) && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/30">
                            {totalPending + totalFailed}
                        </span>
                    )}
                </div>
                <button
                    onClick={fetchSummaries}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Refresh sync queue"
                >
                    <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                </button>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-2 gap-2 px-4 pt-3 pb-2">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
                    <WifiOff className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <div>
                        <p className="text-sm font-bold font-display text-amber-500">{totalPending}</p>
                        <p className="text-[10px] text-muted-foreground">Pending</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/8 border border-destructive/20">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    <div>
                        <p className="text-sm font-bold font-display text-destructive">{totalFailed}</p>
                        <p className="text-[10px] text-muted-foreground">Failed</p>
                    </div>
                </div>
            </div>

            {/* Per-device list */}
            <div className="px-4 lg:px-5 pb-4 max-h-48 overflow-y-auto">
                {loading ? (
                    <div className="space-y-2 py-2">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-8 bg-muted/50 rounded-lg animate-pulse" />
                        ))}
                    </div>
                ) : summaries.length === 0 ? (
                    <div className="py-6 text-center">
                        <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto mb-1.5" />
                        <p className="text-xs text-muted-foreground">All devices synced</p>
                    </div>
                ) : (
                    <div className="space-y-1.5 pt-1">
                        {summaries.map((d, i) => (
                            <motion.div
                                key={d.device_id}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.04 }}
                                className="flex items-center gap-3 py-1.5"
                            >
                                <Wifi className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="flex-1 text-xs font-mono text-foreground truncate">
                                    {d.device_name}
                                </span>
                                <div className="flex items-center gap-2 text-[10px] shrink-0">
                                    {d.pending_count > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-bold border border-amber-500/25">
                                            {d.pending_count} pending
                                        </span>
                                    )}
                                    {d.failed_count > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-bold border border-destructive/25">
                                            {d.failed_count} failed
                                        </span>
                                    )}
                                    <span className="text-muted-foreground/70">
                                        {relativeTime(d.oldest_queued_at)}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}