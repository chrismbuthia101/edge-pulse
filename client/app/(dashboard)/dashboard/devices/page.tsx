"use client";

import { useState, useMemo } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeviceStore } from "@/stores/device-store";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
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

// Fallback static devices if store is empty
const FALLBACK_DEVICES = [
    { id: "1", name: "srv-prod-01", type: "server", status: "online", risk: "high", alerts: 3, os: "Ubuntu 22.04", lastSeen: "Just now", ip: "10.0.1.10", agent: "v2.4.1", cpu: 67, mem: 82 },
    { id: "2", name: "dev-laptop-07", type: "laptop", status: "online", risk: "critical", alerts: 5, os: "macOS 14.3", lastSeen: "Just now", ip: "10.0.2.47", agent: "v2.4.1", cpu: 91, mem: 74 },
    { id: "3", name: "ws-finance-03", type: "workstation", status: "online", risk: "medium", alerts: 1, os: "Windows 11", lastSeen: "2m ago", ip: "10.0.3.23", agent: "v2.4.0", cpu: 34, mem: 55 },
    { id: "4", name: "srv-db-02", type: "server", status: "online", risk: "critical", alerts: 2, os: "RHEL 9", lastSeen: "Just now", ip: "10.0.1.22", agent: "v2.4.1", cpu: 78, mem: 91 },
    { id: "5", name: "gw-primary", type: "server", status: "online", risk: "medium", alerts: 1, os: "pfSense 2.7", lastSeen: "5m ago", ip: "10.0.0.1", agent: "v2.4.1", cpu: 23, mem: 41 },
    { id: "6", name: "dev-macbook-12", type: "laptop", status: "online", risk: "low", alerts: 0, os: "macOS 14.3", lastSeen: "12m ago", ip: "10.0.2.52", agent: "v2.4.1", cpu: 12, mem: 38 },
    { id: "7", name: "srv-backup-01", type: "server", status: "offline", risk: "none", alerts: 0, os: "Debian 12", lastSeen: "2h ago", ip: "10.0.1.30", agent: "v2.3.9", cpu: 0, mem: 0 },
    { id: "8", name: "ws-eng-05", type: "workstation", status: "online", risk: "low", alerts: 0, os: "Windows 11", lastSeen: "3m ago", ip: "10.0.3.35", agent: "v2.4.1", cpu: 45, mem: 62 },
];

type RiskFilter = "all" | "critical" | "high" | "medium" | "low" | "none";
type StatusFilter = "all" | "online" | "offline";
type SortKey = "name" | "risk" | "status" | "cpu" | "mem" | null;
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

// Enroll Device Modal
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
                        <strong className="text-foreground">Note:</strong> The agent requires admin/root privileges to install. After installation, the device will appear in your fleet within 30 seconds.
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

// Isolate Confirmation Modal
function IsolateModal({
    deviceName,
    open,
    onClose,
    onConfirm,
}: {
    deviceName: string;
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Isolate Device</DialogTitle>
                    <DialogDescription>
                        This will cut off <strong>{deviceName}</strong> from all network access except the EdgePulse management channel. Are you sure?
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
    const storeDevices = useDeviceStore((s) => s.devices);
    const supabase = createClient();

    // Use store devices if available, otherwise fallback
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
            ip: d.ip ?? "—",
            agent: d.agent_version ?? "—",
            cpu: d.cpu_percent ?? 0,
            mem: d.ram_percent ?? 0,
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

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("asc");
        }
    };

    const filtered = useMemo(() => {
        const riskOrder = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

        let result = rawDevices.filter((d) => {
            const matchesSearch =
                d.name.toLowerCase().includes(search.toLowerCase()) ||
                d.ip.includes(search) ||
                d.os.toLowerCase().includes(search.toLowerCase());
            const matchesRisk = riskFilter === "all" || d.risk === riskFilter;
            const matchesStatus = statusFilter === "all" || d.status === statusFilter;
            return matchesSearch && matchesRisk && matchesStatus;
        });

        if (sortKey) {
            result = [...result].sort((a, b) => {
                let aVal: number | string = "";
                let bVal: number | string = "";
                if (sortKey === "name") { aVal = a.name; bVal = b.name; }
                if (sortKey === "risk") { aVal = riskOrder[a.risk as keyof typeof riskOrder] ?? 99; bVal = riskOrder[b.risk as keyof typeof riskOrder] ?? 99; }
                if (sortKey === "status") { aVal = a.status; bVal = b.status; }
                if (sortKey === "cpu") { aVal = a.cpu; bVal = b.cpu; }
                if (sortKey === "mem") { aVal = a.mem; bVal = b.mem; }

                if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
                if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [rawDevices, search, riskFilter, statusFilter, sortKey, sortDir]);

    const online = rawDevices.filter((d) => d.status === "online").length;

    const handleSync = async () => {
        setSyncing(true);
        try {
            const { data } = await supabase.from("devices").select("*").order("name");
            if (data) toast.success(`Synced ${data.length} devices`);
        } catch {
            toast.error("Sync failed");
        } finally {
            setSyncing(false);
        }
    };

    const handleIsolateConfirm = async () => {
        if (!isolateDevice) return;
        try {
            await supabase
                .from("devices")
                .update({ status: "isolated" })
                .eq("id", isolateDevice.id);
            toast.success(`${isolateDevice.name} has been isolated`);
        } catch {
            toast.error("Failed to isolate device");
        } finally {
            setIsolateDevice(null);
        }
    };

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return null;
        return sortDir === "asc" ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />;
    };

    return (
        <div className="max-w-[1200px] space-y-6">
            {/* Modals */}
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
                    <p className="text-sm text-muted-foreground mt-0.5">{online} of {rawDevices.length} devices online</p>
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
                    { label: "Total Enrolled", value: rawDevices.length, color: "text-foreground" },
                    { label: "Online", value: online, color: "text-green-500" },
                    { label: "At Risk", value: rawDevices.filter((d) => ["critical", "high"].includes(d.risk)).length, color: "text-destructive" },
                    { label: "Needs Update", value: rawDevices.filter((d) => d.agent !== "v2.4.1").length, color: "text-amber-500" },
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
                    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                        {(["all", "online", "offline"] as const).map((f) => (
                            <button key={f} onClick={() => setStatusFilter(f)} aria-pressed={statusFilter === f}
                                className={cn("px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all", statusFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                                {f}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                        {(["all", "critical", "high", "medium", "low"] as const).map((f) => (
                            <button key={f} onClick={() => setRiskFilter(f)} aria-pressed={riskFilter === f}
                                className={cn("px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all", riskFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Device table */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Table header — sortable */}
                <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {[
                        { label: "Device", key: "name" as SortKey },
                        { label: "OS", key: null },
                        { label: "IP Address", key: null },
                        { label: "Agent", key: null },
                        { label: "Risk", key: "risk" as SortKey },
                        { label: "CPU / RAM", key: "cpu" as SortKey },
                    ].map(({ label, key }) => (
                        <button
                            key={label}
                            onClick={() => key && handleSort(key)}
                            className={cn("text-left flex items-center gap-1", key && "hover:text-foreground transition-colors cursor-pointer")}
                        >
                            {label}
                            {key && <SortIcon col={key} />}
                        </button>
                    ))}
                    <span className="w-5" />
                </div>

                <div className="divide-y divide-border">
                    {filtered.map((device, i) => {
                        const risk = riskConfig[device.risk as keyof typeof riskConfig] ?? riskConfig.none;
                        const isSelected = selectedId === device.id;

                        return (
                            <motion.div key={device.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                                {/* Mobile card */}
                                <div className="lg:hidden p-4 space-y-2 hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedId(isSelected ? null : device.id)}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="relative w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                                                <DeviceIcon type={device.type} />
                                                <div className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-card", device.status === "online" ? "bg-green-500" : "bg-muted-foreground/40")} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium font-mono">{device.name}</p>
                                                <p className="text-xs text-muted-foreground">{device.lastSeen}</p>
                                            </div>
                                        </div>
                                        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", risk.bg, risk.color)}>{risk.label}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        <span>{device.os}</span>
                                        <span className="font-mono">{device.ip}</span>
                                        <span className={cn("font-mono", device.agent === "v2.4.1" ? "text-green-500" : "text-amber-500")}>{device.agent}</span>
                                    </div>
                                </div>

                                {/* Desktop row */}
                                <div
                                    className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 items-center px-5 py-3.5 hover:bg-muted/30 cursor-pointer transition-colors"
                                    onClick={() => setSelectedId(isSelected ? null : device.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="relative w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                            <DeviceIcon type={device.type} />
                                            <div className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-card", device.status === "online" ? "bg-green-500" : "bg-muted-foreground/40")} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-foreground font-mono">{device.name}</p>
                                            <p className="text-xs text-muted-foreground">{device.lastSeen}</p>
                                        </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{device.os}</span>
                                    <span className="text-xs font-mono text-muted-foreground">{device.ip}</span>
                                    <span className={cn("text-xs font-mono", device.agent === "v2.4.1" ? "text-green-500" : "text-amber-500")}>{device.agent}</span>
                                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full w-fit", risk.bg, risk.color)}>{risk.label}</span>
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
                                            <span className="text-xs text-muted-foreground/50">Offline</span>
                                        )}
                                    </div>
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

                                {/* Expanded row */}
                                {isSelected && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="px-5 pb-4 bg-muted/20 border-t border-border"
                                    >
                                        <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            <div>
                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Device Type</p>
                                                <p className="text-sm font-medium text-foreground capitalize">{device.type}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Active Alerts</p>
                                                <p className={cn("text-sm font-medium", device.alerts > 0 ? "text-destructive" : "text-green-500")}>
                                                    {device.alerts > 0 ? `${device.alerts} alerts` : "No alerts"}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Status</p>
                                                <p className={cn("text-sm font-medium capitalize", device.status === "online" ? "text-green-500" : "text-muted-foreground")}>
                                                    {device.status}
                                                </p>
                                            </div>
                                            <div className="flex items-end gap-2 flex-wrap">
                                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
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
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
                <div className="px-5 py-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">Showing {filtered.length} of {rawDevices.length} devices</p>
                </div>
            </div>
        </div>
    );
}