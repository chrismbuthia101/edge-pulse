"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
    MonitorSmartphone,
    Laptop,
    Server,
    Shield,
    AlertTriangle,
    Search,
    Plus,
    RefreshCw,
    ChevronRight,
    ChevronUp,
    ChevronDown,
    Link2,
    Link2Off,
    Clock,
    Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeviceStore } from "@/stores/device-store";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";

const riskConfig = {
    critical: { color: "text-destructive", bg: "bg-destructive/10", label: "Critical" },
    high: { color: "text-orange-500", bg: "bg-orange-500/10", label: "High" },
    medium: { color: "text-amber-500", bg: "bg-amber-500/10", label: "Medium" },
    low: { color: "text-primary", bg: "bg-primary/10", label: "Low" },
    none: { color: "text-green-500", bg: "bg-green-500/10", label: "Clean" },
};

// Device state derived from status + last_seen
type DeviceState = "reporting" | "silent" | "unsynced" | "installed" | "offline";

const deviceStateConfig: Record<DeviceState, { label: string; color: string; bg: string; dot: string }> = {
    reporting: { label: "Reporting", color: "text-green-500", bg: "bg-green-500/10", dot: "bg-green-500 animate-pulse" },
    silent: { label: "Silent", color: "text-amber-500", bg: "bg-amber-500/10", dot: "bg-amber-500" },
    unsynced: { label: "Unsynced", color: "text-orange-500", bg: "bg-orange-500/10", dot: "bg-orange-500" },
    installed: { label: "Installed", color: "text-primary", bg: "bg-primary/10", dot: "bg-primary" },
    offline: { label: "Offline", color: "text-muted-foreground", bg: "bg-muted", dot: "bg-muted-foreground/40" },
};

function computeDeviceState(status: string, lastSeenIso?: string, syncQueueDepth = 0): DeviceState {
    if (status === "installed") return "installed";
    if (status === "offline" || status === "isolated") return "offline";
    if (!lastSeenIso) return "unsynced";
    const minsAgo = (Date.now() - new Date(lastSeenIso).getTime()) / 60000;
    if (syncQueueDepth > 10) return "unsynced";
    if (minsAgo < 5) return "reporting";
    if (minsAgo < 60) return "silent";
    return "unsynced";
}

const FALLBACK_DEVICES = [
    { id: "1", name: "srv-prod-01", type: "server", status: "online", risk: "high", alerts: 3, os: "Ubuntu 22.04", lastSeen: "Just now", lastSeenIso: new Date(Date.now() - 30000).toISOString(), ip: "10.0.1.10", agent: "v2.4.1", cpu: 67, mem: 82, syncQueueDepth: 0, hashChainOk: true },
    { id: "2", name: "dev-laptop-07", type: "laptop", status: "online", risk: "critical", alerts: 5, os: "macOS 14.3", lastSeen: "Just now", lastSeenIso: new Date(Date.now() - 60000).toISOString(), ip: "10.0.2.47", agent: "v2.4.1", cpu: 91, mem: 74, syncQueueDepth: 2, hashChainOk: true },
    { id: "3", name: "ws-finance-03", type: "workstation", status: "online", risk: "medium", alerts: 1, os: "Windows 11", lastSeen: "2m ago", lastSeenIso: new Date(Date.now() - 120000).toISOString(), ip: "10.0.3.23", agent: "v2.4.0", cpu: 34, mem: 55, syncQueueDepth: 0, hashChainOk: true },
    { id: "4", name: "srv-db-02", type: "server", status: "online", risk: "critical", alerts: 2, os: "RHEL 9", lastSeen: "Just now", lastSeenIso: new Date(Date.now() - 45000).toISOString(), ip: "10.0.1.22", agent: "v2.4.1", cpu: 78, mem: 91, syncQueueDepth: 0, hashChainOk: false },
    { id: "5", name: "gw-primary", type: "server", status: "online", risk: "medium", alerts: 1, os: "pfSense 2.7", lastSeen: "5m ago", lastSeenIso: new Date(Date.now() - 300000).toISOString(), ip: "10.0.0.1", agent: "v2.4.1", cpu: 23, mem: 41, syncQueueDepth: 5, hashChainOk: true },
    { id: "6", name: "dev-macbook-12", type: "laptop", status: "online", risk: "low", alerts: 0, os: "macOS 14.3", lastSeen: "12m ago", lastSeenIso: new Date(Date.now() - 720000).toISOString(), ip: "10.0.2.52", agent: "v2.4.1", cpu: 12, mem: 38, syncQueueDepth: 0, hashChainOk: true },
    { id: "7", name: "srv-backup-01", type: "server", status: "offline", risk: "none", alerts: 0, os: "Debian 12", lastSeen: "2h ago", lastSeenIso: new Date(Date.now() - 7200000).toISOString(), ip: "10.0.1.30", agent: "v2.3.9", cpu: 0, mem: 0, syncQueueDepth: 18, hashChainOk: true },
    { id: "8", name: "ws-eng-05", type: "workstation", status: "online", risk: "low", alerts: 0, os: "Windows 11", lastSeen: "3m ago", lastSeenIso: new Date(Date.now() - 180000).toISOString(), ip: "10.0.3.35", agent: "v2.4.1", cpu: 45, mem: 62, syncQueueDepth: 0, hashChainOk: true },
];

type RiskFilter = "all" | "critical" | "high" | "medium" | "low" | "none";
type StatusFilter = "all" | "reporting" | "silent" | "unsynced" | "offline";
type SortKey = "name" | "risk" | "state" | "cpu" | "mem" | "syncQueue" | null;
type SortDir = "asc" | "desc";

function DeviceIcon({ type }: { type: string }) {
    if (type === "server") return <Server className="h-4 w-4" />;
    if (type === "laptop") return <Laptop className="h-4 w-4" />;
    return <MonitorSmartphone className="h-4 w-4" />;
}

function MiniBar({ value, color }: { value: number; color: string }) {
    return (
        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
        </div>
    );
}

function HashChainBadge({ ok }: { ok: boolean }) {
    return (
        <span className={cn(
            "flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
            ok
                ? "text-green-600 bg-green-500/10 border-green-500/20"
                : "text-destructive bg-destructive/10 border-destructive/20"
        )}>
            {ok ? <Link2 className="h-2.5 w-2.5" /> : <Link2Off className="h-2.5 w-2.5" />}
            {ok ? "Intact" : "Broken"}
        </span>
    );
}

function EnrollDeviceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Enroll a Device</DialogTitle>
                    <DialogDescription>
                        Install the EdgePulse agent on a device to start monitoring it.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Linux / macOS</p>
                        <div className="bg-muted rounded-lg p-3 font-mono text-xs text-foreground">
                            curl -fsSL https://install.edgepulse.io | sudo bash -s -- --token YOUR_TOKEN
                        </div>
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Windows (PowerShell)</p>
                        <div className="bg-muted rounded-lg p-3 font-mono text-xs text-foreground">
                            iwr https://install.edgepulse.io/win | iex; Install-EdgePulse -Token YOUR_TOKEN
                        </div>
                    </div>
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-muted-foreground">
                        <strong className="text-foreground">Note:</strong> The agent requires admin/root privileges. After installation, the device appears within 30 seconds.
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button onClick={() => { navigator.clipboard.writeText("YOUR_TOKEN"); toast.success("Token copied"); }}>
                        Copy Token
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function IsolateModal({ deviceName, open, onClose, onConfirm }: {
    deviceName: string; open: boolean; onClose: () => void; onConfirm: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Isolate Device</DialogTitle>
                    <DialogDescription>
                        This will cut off <strong>{deviceName}</strong> from all network access except the EdgePulse management channel.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button variant="destructive" onClick={onConfirm}>Isolate Device</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function DevicesPage() {
    useEffect(() => {
        document.title = "Device Fleet - EdgePulse";
    }, []);

    const storeDevices = useDeviceStore((s) => s.devices);
    const supabase = createClient();
    const router = useRouter();

    const rawDevices = storeDevices.length > 0
        ? storeDevices.map((d) => ({
            id: d.id,
            name: d.name,
            type: d.type ?? "workstation",
            status: d.status,
            risk: d.risk ?? "none",
            alerts: d.alerts_count ?? 0,
            os: d.os ?? "Unknown",
            lastSeen: d.last_seen ? new Date(d.last_seen).toLocaleTimeString() : "Unknown",
            lastSeenIso: d.last_seen ?? null,
            ip: d.ip ?? "—",
            agent: d.agent_version ?? "—",
            cpu: d.cpu_percent ?? 0,
            mem: d.ram_percent ?? 0,
            syncQueueDepth: d.sync_queue_depth ?? 0,
            hashChainOk: d.hash_chain_ok ?? true,
        }))
        : FALLBACK_DEVICES;

    const [search, setSearch] = useState("");
    const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>(null);
    const [sortDir, setSortDir] = useState<SortDir>("asc");
    const [enrollOpen, setEnrollOpen] = useState(false);
    const [isolateDevice, setIsolateDevice] = useState<{ id: string; name: string } | null>(null);
    const [syncing, setSyncing] = useState(false);

    // Enrich with computed device state
    const enrichedDevices = useMemo(() => rawDevices.map((d) => ({
        ...d,
        deviceState: computeDeviceState(d.status, d.lastSeenIso ?? undefined, d.syncQueueDepth),
    })), [rawDevices]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        else { setSortKey(key); setSortDir("asc"); }
    };

    const filtered = useMemo(() => {
        const riskOrder = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
        let result = enrichedDevices.filter((d) => {
            const matchesSearch =
                d.name.toLowerCase().includes(search.toLowerCase()) ||
                d.ip.includes(search) ||
                d.os.toLowerCase().includes(search.toLowerCase());
            const matchesRisk = riskFilter === "all" || d.risk === riskFilter;
            const matchesStatus = statusFilter === "all" || d.deviceState === statusFilter;
            return matchesSearch && matchesRisk && matchesStatus;
        });

        if (sortKey) {
            result = [...result].sort((a, b) => {
                let aVal: number | string = "";
                let bVal: number | string = "";
                if (sortKey === "name") { aVal = a.name; bVal = b.name; }
                if (sortKey === "risk") { aVal = riskOrder[a.risk as keyof typeof riskOrder] ?? 99; bVal = riskOrder[b.risk as keyof typeof riskOrder] ?? 99; }
                if (sortKey === "state") { aVal = a.deviceState; bVal = b.deviceState; }
                if (sortKey === "cpu") { aVal = a.cpu; bVal = b.cpu; }
                if (sortKey === "mem") { aVal = a.mem; bVal = b.mem; }
                if (sortKey === "syncQueue") { aVal = a.syncQueueDepth; bVal = b.syncQueueDepth; }
                if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
                if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [enrichedDevices, search, riskFilter, statusFilter, sortKey, sortDir]);

    const counts = useMemo(() => ({
        total: enrichedDevices.length,
        reporting: enrichedDevices.filter((d) => d.deviceState === "reporting").length,
        silent: enrichedDevices.filter((d) => d.deviceState === "silent").length,
        unsynced: enrichedDevices.filter((d) => d.deviceState === "unsynced").length,
        atRisk: enrichedDevices.filter((d) => ["critical", "high"].includes(d.risk)).length,
    }), [enrichedDevices]);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const { data } = await supabase.from("devices").select("*").order("name");
            if (data) toast.success(`Synced ${data.length} devices`);
        } catch { toast.error("Sync failed"); }
        finally { setSyncing(false); }
    };

    const handleIsolateConfirm = async () => {
        if (!isolateDevice) return;
        try {
            await supabase.from("devices").update({ status: "isolated" }).eq("id", isolateDevice.id);
            toast.success(`${isolateDevice.name} has been isolated`);
        } catch { toast.error("Failed to isolate device"); }
        finally { setIsolateDevice(null); }
    };

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return null;
        return sortDir === "asc"
            ? <ChevronUp className="h-3 w-3 inline ml-0.5" />
            : <ChevronDown className="h-3 w-3 inline ml-0.5" />;
    };

    return (
        <div className="max-w-[1200px] space-y-6">
            <EnrollDeviceModal open={enrollOpen} onClose={() => setEnrollOpen(false)} />
            <IsolateModal
                deviceName={isolateDevice?.name ?? ""}
                open={!!isolateDevice}
                onClose={() => setIsolateDevice(null)}
                onConfirm={handleIsolateConfirm}
            />

            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">Device Fleet</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {counts.reporting} reporting · {counts.silent} silent · {counts.unsynced} unsynced
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSync} disabled={syncing}>
                        <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
                        {syncing ? "Syncing..." : "Sync"}
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={() => setEnrollOpen(true)}>
                        <Plus className="h-3.5 w-3.5" />
                        Enroll Device
                    </Button>
                </div>
            </motion.div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "Total Enrolled", value: counts.total, color: "text-foreground" },
                    { label: "Reporting", value: counts.reporting, color: "text-green-500" },
                    { label: "At Risk", value: counts.atRisk, color: "text-destructive" },
                    { label: "Unsynced", value: counts.unsynced, color: "text-amber-500" },
                ].map((s) => (
                    <div key={s.label} className="bg-card border border-border rounded-xl p-4">
                        <p className={`text-2xl font-bold font-display ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Search devices..." className="pl-9 h-9 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* State filter */}
                    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                        {(["all", "reporting", "silent", "unsynced", "offline"] as const).map((f) => (
                            <button key={f} onClick={() => setStatusFilter(f)} aria-pressed={statusFilter === f}
                                className={cn("px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all",
                                    statusFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                                {f}
                            </button>
                        ))}
                    </div>
                    {/* Risk filter */}
                    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                        {(["all", "critical", "high", "medium", "low"] as const).map((f) => (
                            <button key={f} onClick={() => setRiskFilter(f)} aria-pressed={riskFilter === f}
                                className={cn("px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all",
                                    riskFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Device table */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Table header */}
                <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 px-5 py-3 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {[
                        { label: "Device", key: "name" as SortKey },
                        { label: "State", key: "state" as SortKey },
                        { label: "OS / IP", key: null },
                        { label: "Agent", key: null },
                        { label: "Risk", key: "risk" as SortKey },
                        { label: "CPU / RAM", key: "cpu" as SortKey },
                        { label: "Sync Queue", key: "syncQueue" as SortKey },
                    ].map(({ label, key }) => (
                        <button key={label} onClick={() => key && handleSort(key)}
                            className={cn("text-left flex items-center gap-1", key && "hover:text-foreground transition-colors cursor-pointer")}>
                            {label}{key && <SortIcon col={key} />}
                        </button>
                    ))}
                    <span />
                </div>

                <div className="divide-y divide-border">
                    {filtered.map((device, i) => {
                        const risk = riskConfig[device.risk as keyof typeof riskConfig] ?? riskConfig.none;
                        const state = deviceStateConfig[device.deviceState];
                        const isSelected = selectedId === device.id;

                        return (
                            <motion.div key={device.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                                {/* Mobile card */}
                                <div className="lg:hidden p-4 space-y-3 hover:bg-muted/30 cursor-pointer transition-colors"
                                    onClick={() => router.push(`/dashboard/devices/${device.id}`)}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="relative w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                                <DeviceIcon type={device.type} />
                                                <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card", state.dot)} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium font-mono truncate">{device.name}</p>
                                                <p className="text-xs text-muted-foreground">{device.lastSeen}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <span className={cn("text-xs font-bold px-2 py-1 rounded-full", risk.bg, risk.color)}>{risk.label}</span>
                                            {device.alerts > 0 && (
                                                <div className="flex items-center gap-1 text-xs text-destructive">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    <span className="font-bold">{device.alerts}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div className="space-y-1">
                                            <p className="text-muted-foreground">Status</p>
                                            <p className={cn("font-semibold", state.color)}>{state.label}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-muted-foreground">OS</p>
                                            <p className="font-medium truncate">{device.os}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-muted-foreground">IP</p>
                                            <p className="font-mono truncate">{device.ip}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-muted-foreground">Agent</p>
                                            <p className={cn("font-mono", device.agent === "v2.4.1" ? "text-green-500" : "text-amber-500")}>
                                                {device.agent}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Mobile performance bars */}
                                    {device.status === "online" && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-muted-foreground w-12">CPU</span>
                                                <MiniBar value={device.cpu} color={device.cpu > 80 ? "bg-destructive" : "bg-primary"} />
                                                <span className="text-[10px] font-mono text-muted-foreground">{device.cpu}%</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-muted-foreground w-12">RAM</span>
                                                <MiniBar value={device.mem} color={device.mem > 80 ? "bg-orange-500" : "bg-violet-500"} />
                                                <span className="text-[10px] font-mono text-muted-foreground">{device.mem}%</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Mobile sync queue indicator */}
                                    {device.syncQueueDepth > 0 && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">Sync Queue</span>
                                            <span className={cn(
                                                "text-xs font-bold px-2 py-1 rounded-full border",
                                                device.syncQueueDepth > 10
                                                    ? "text-destructive bg-destructive/10 border-destructive/20"
                                                    : "text-amber-500 bg-amber-500/10 border-amber-500/20"
                                            )}>
                                                {device.syncQueueDepth} events
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Desktop row */}
                                <div
                                    className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 items-center px-5 py-3.5 hover:bg-muted/30 cursor-pointer transition-colors"
                                    onClick={() => setSelectedId(isSelected ? null : device.id)}
                                >
                                    {/* Device name + last seen */}
                                    <div className="flex items-center gap-3">
                                        <div className="relative w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                            <DeviceIcon type={device.type} />
                                            <div className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-card", state.dot)} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-foreground font-mono">{device.name}</p>
                                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Clock className="h-2.5 w-2.5" />
                                                {device.lastSeen}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Device state */}
                                    <span className={cn("text-xs font-semibold", state.color)}>{state.label}</span>

                                    {/* OS / IP */}
                                    <div>
                                        <p className="text-xs text-muted-foreground">{device.os}</p>
                                        <p className="text-xs font-mono text-muted-foreground/70">{device.ip}</p>
                                    </div>

                                    {/* Agent version */}
                                    <div className="space-y-1">
                                        <span className={cn("text-xs font-mono block", device.agent === "v2.4.1" ? "text-green-500" : "text-amber-500")}>
                                            {device.agent}
                                        </span>
                                        <HashChainBadge ok={device.hashChainOk} />
                                    </div>

                                    {/* Risk */}
                                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full w-fit", risk.bg, risk.color)}>{risk.label}</span>

                                    {/* CPU / RAM */}
                                    <div className="space-y-1">
                                        {device.status === "online" ? (
                                            <>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-muted-foreground w-8">CPU</span>
                                                    <MiniBar value={device.cpu} color={device.cpu > 80 ? "bg-destructive" : "bg-primary"} />
                                                    <span className="text-[10px] font-mono text-muted-foreground">{device.cpu}%</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-muted-foreground w-8">RAM</span>
                                                    <MiniBar value={device.mem} color={device.mem > 80 ? "bg-orange-500" : "bg-violet-500"} />
                                                    <span className="text-[10px] font-mono text-muted-foreground">{device.mem}%</span>
                                                </div>
                                            </>
                                        ) : (
                                            <span className="text-xs text-muted-foreground/50">—</span>
                                        )}
                                    </div>

                                    {/* Sync queue depth */}
                                    <div className="flex items-center gap-1.5">
                                        {device.syncQueueDepth > 0 ? (
                                            <span className={cn(
                                                "text-xs font-bold px-1.5 py-0.5 rounded-full border",
                                                device.syncQueueDepth > 10
                                                    ? "text-destructive bg-destructive/10 border-destructive/20"
                                                    : "text-amber-500 bg-amber-500/10 border-amber-500/20"
                                            )}>
                                                {device.syncQueueDepth}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-green-500 font-mono">0</span>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        {device.alerts > 0 ? (
                                            <div className="flex items-center gap-1 text-xs text-destructive">
                                                <AlertTriangle className="h-3 w-3" />
                                                <span className="font-bold">{device.alerts}</span>
                                            </div>
                                        ) : (
                                            <Shield className="h-3.5 w-3.5 text-green-500" />
                                        )}
                                        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isSelected && "rotate-90")} />
                                    </div>
                                </div>

                                {/* Expanded row — agent health summary */}
                                {isSelected && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="px-5 pb-4 bg-muted/20 border-t border-border"
                                    >
                                        <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                                            <div>
                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Device State</p>
                                                <p className={cn("text-sm font-semibold", state.color)}>{state.label}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Agent Version</p>
                                                <p className={cn("text-sm font-mono font-medium", device.agent === "v2.4.1" ? "text-green-500" : "text-amber-500")}>
                                                    {device.agent}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Last Seen</p>
                                                <p className="text-sm font-medium text-foreground">{device.lastSeen}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Sync Queue</p>
                                                <p className={cn("text-sm font-bold font-mono",
                                                    device.syncQueueDepth === 0 ? "text-green-500" : device.syncQueueDepth > 10 ? "text-destructive" : "text-amber-500")}>
                                                    {device.syncQueueDepth} events
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Hash Chain</p>
                                                <HashChainBadge ok={device.hashChainOk} />
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Active Alerts</p>
                                                <p className={cn("text-sm font-medium", device.alerts > 0 ? "text-destructive" : "text-green-500")}>
                                                    {device.alerts > 0 ? `${device.alerts} alerts` : "None"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mt-4 flex-wrap">
                                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                                                onClick={() => router.push(`/dashboard/devices/${device.id}`)}>
                                                <Activity className="h-3 w-3" />
                                                View Full Report
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                                                onClick={() => setIsolateDevice({ id: device.id, name: device.name })}
                                            >
                                                Isolate
                                            </Button>
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
                <div className="px-5 py-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">Showing {filtered.length} of {enrichedDevices.length} devices</p>
                </div>
            </div>
        </div>
    );
}