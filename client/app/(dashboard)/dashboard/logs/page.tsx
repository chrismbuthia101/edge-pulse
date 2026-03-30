"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Shield,
    AlertTriangle,
    CheckCircle,
    RefreshCw,
    Download,
    Search,
    Filter,
    Calendar,
    Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/useAuth";
import { toast } from "sonner";

interface TamperLogEntry {
    log_id: string;
    device_id: string;
    log_sequence_number: number;
    log_entry_type: string;
    log_entry_reference_id: string;
    entry_timestamp_utc: string;
    entry_content_hash: string;
    previous_entry_hash: string;
    digital_signature: string;
}

interface VerificationResult {
    is_valid: boolean;
    entries_checked: number;
    first_broken_sequence?: number;
    break_reason?: string;
    device_id: string;
}

export default function LogsPage() {
    const { user, hasRole } = useAuth();
    const supabase = createClient();

    const [logs, setLogs] = useState<TamperLogEntry[]>([]);
    const [devices, setDevices] = useState<string[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<string>("all");
    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [entryTypeFilter, setEntryTypeFilter] = useState<string>("all");

    useEffect(() => {
        document.title = "Logs - EdgePulse";
        fetchDevices();
    }, []);

    useEffect(() => {
        if (selectedDevice !== "all") {
            fetchLogs();
        }
    }, [selectedDevice, entryTypeFilter]);

    const fetchDevices = async () => {
        try {
            const { data, error } = await supabase
                .from("tamper_evident_log")
                .select("device_id")
                .order("device_id");

            if (error) throw error;

            const uniqueDevices = [...new Set((data || []).map((log) => log.device_id))];
            setDevices(uniqueDevices);
            
            if (uniqueDevices.length > 0) {
                setSelectedDevice(uniqueDevices[0]);
            }
        } catch (error) {
            console.error("Failed to fetch devices:", error);
            toast.error("Failed to load devices");
        }
    };

    const fetchLogs = async () => {
        if (selectedDevice === "all") return;

        try {
            setLoading(true);

            let query = supabase
                .from("tamper_evident_log")
                .select("*")
                .eq("device_id", selectedDevice)
                .order("log_sequence_number", { ascending: false })
                .limit(100); // Limit to recent logs

            if (entryTypeFilter !== "all") {
                query = query.eq("log_entry_type", entryTypeFilter);
            }

            const { data, error } = await query;

            if (error) throw error;

            setLogs(data || []);
        } catch (error) {
            console.error("Failed to fetch logs:", error);
            toast.error("Failed to load logs");
        } finally {
            setLoading(false);
        }
    };

    const verifyChain = async () => {
        if (selectedDevice === "all") {
            toast.error("Please select a device first");
            return;
        }

        try {
            setVerifying(true);

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/verify-hash-chain?device_id=${selectedDevice}`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${await supabase.auth.getSession().then(s => s.data.session?.access_token)}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`Verification failed: ${response.statusText}`);
            }

            const result: VerificationResult = await response.json();
            setVerificationResult(result);

            if (result.is_valid) {
                toast.success(`Chain verified: ${result.entries_checked} entries`);
            } else {
                toast.error(`Chain broken at entry ${result.first_broken_sequence}`);
            }
        } catch (error) {
            console.error("Failed to verify chain:", error);
            toast.error("Failed to verify hash chain");
        } finally {
            setVerifying(false);
        }
    };

    const exportChain = async () => {
        if (selectedDevice === "all") {
            toast.error("Please select a device first");
            return;
        }

        try {
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/verify-hash-chain?device_id=${selectedDevice}&export=true`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${await supabase.auth.getSession().then(s => s.data.session?.access_token)}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`Export failed: ${response.statusText}`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `tamper-chain-${selectedDevice}-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast.success("Chain exported successfully");
        } catch (error) {
            console.error("Failed to export chain:", error);
            toast.error("Failed to export hash chain");
        }
    };

    const filteredLogs = logs.filter(
        (log) =>
            log.log_entry_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.log_entry_reference_id?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getEntryTypeColor = (type: string) => {
        const colors: Record<string, string> = {
            "TELEMETRY": "bg-blue-500/10 text-blue-500 border-blue-500/20",
            "ALERT": "bg-red-500/10 text-red-500 border-red-500/20",
            "DETECTION": "bg-orange-500/10 text-orange-500 border-orange-500/20",
            "SYNC": "bg-green-500/10 text-green-500 border-green-500/20",
            "SYSTEM": "bg-purple-500/10 text-purple-500 border-purple-500/20",
        };
        return colors[type] || "bg-gray-500/10 text-gray-500 border-gray-500/20";
    };

    const getEntryTypeIcon = (type: string) => {
        const icons: Record<string, string> = {
            "TELEMETRY": "📊",
            "ALERT": "🚨",
            "DETECTION": "🔍",
            "SYNC": "🔄",
            "SYSTEM": "⚙️",
        };
        return icons[type] || "📝";
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between"
            >
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">
                        Tamper-Evident Logs
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Verify integrity of cryptographic hash chains
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={exportChain}
                        disabled={selectedDevice === "all"}
                        className="gap-2"
                    >
                        <Download className="h-4 w-4" />
                        Export
                    </Button>
                    <Button
                        onClick={verifyChain}
                        disabled={selectedDevice === "all" || verifying}
                        className="gap-2"
                    >
                        {verifying ? (
                            <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Verifying...
                            </>
                        ) : (
                            <>
                                <Shield className="h-4 w-4" />
                                Verify Chain
                            </>
                        )}
                    </Button>
                </div>
            </motion.div>

            {/* Verification Result */}
            {verificationResult && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <Card className={verificationResult.is_valid ? "border-green-500/20" : "border-red-500/20"}>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {verificationResult.is_valid ? (
                                        <CheckCircle className="h-5 w-5 text-green-500" />
                                    ) : (
                                        <AlertTriangle className="h-5 w-5 text-red-500" />
                                    )}
                                    <div>
                                        <h3 className="font-semibold">
                                            Chain {verificationResult.is_valid ? "Valid" : "Invalid"}
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            Device: {verificationResult.device_id} • {verificationResult.entries_checked} entries checked
                                        </p>
                                    </div>
                                </div>
                                <Badge
                                    className={verificationResult.is_valid ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}
                                >
                                    {verificationResult.is_valid ? "VERIFIED" : "BROKEN"}
                                </Badge>
                            </div>
                            {!verificationResult.is_valid && verificationResult.break_reason && (
                                <div className="mt-4 p-3 bg-red-500/10 rounded-md">
                                    <p className="text-sm text-red-500">
                                        <strong>Break Reason:</strong> {verificationResult.break_reason}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* Filters */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex flex-col sm:flex-row gap-4"
            >
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search logs..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>
                <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                    <SelectTrigger className="w-full sm:w-48">
                        <SelectValue placeholder="Select device" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Devices</SelectItem>
                        {devices.map((device) => (
                            <SelectItem key={device} value={device}>
                                {device}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={entryTypeFilter} onValueChange={setEntryTypeFilter}>
                    <SelectTrigger className="w-full sm:w-32">
                        <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="TELEMETRY">Telemetry</SelectItem>
                        <SelectItem value="ALERT">Alert</SelectItem>
                        <SelectItem value="DETECTION">Detection</SelectItem>
                        <SelectItem value="SYNC">Sync</SelectItem>
                        <SelectItem value="SYSTEM">System</SelectItem>
                    </SelectContent>
                </Select>
            </motion.div>

            {/* Logs List */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
            >
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-muted-foreground">Loading logs...</p>
                    </div>
                ) : selectedDevice === "all" ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <Shield className="h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold text-foreground mb-2">
                                Select a Device
                            </h3>
                            <p className="text-sm text-muted-foreground text-center">
                                Choose a device to view its tamper-evident log entries
                            </p>
                        </CardContent>
                    </Card>
                ) : filteredLogs.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold text-foreground mb-2">
                                No logs found
                            </h3>
                            <p className="text-sm text-muted-foreground text-center">
                                {searchTerm || entryTypeFilter !== "all"
                                    ? "Try adjusting your search or filters"
                                    : "No tamper log entries available for this device"}
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    filteredLogs.map((log, index) => (
                        <motion.div
                            key={log.log_id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 + index * 0.02 }}
                        >
                            <Card className="hover:shadow-md transition-shadow">
                                <CardContent className="pt-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-lg">
                                                    {getEntryTypeIcon(log.log_entry_type)}
                                                </span>
                                                <Badge className={getEntryTypeColor(log.log_entry_type)}>
                                                    {log.log_entry_type}
                                                </Badge>
                                                <span className="text-sm font-mono text-muted-foreground">
                                                    #{log.log_sequence_number}
                                                </span>
                                            </div>
                                            
                                            {log.log_entry_reference_id && (
                                                <p className="text-sm text-muted-foreground mb-2">
                                                    Reference: {log.log_entry_reference_id}
                                                </p>
                                            )}
                                            
                                            <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                                                <div>
                                                    <span className="font-medium">Hash:</span>
                                                    <div className="font-mono truncate">
                                                        {log.entry_content_hash}
                                                    </div>
                                                </div>
                                                <div>
                                                    <span className="font-medium">Previous:</span>
                                                    <div className="font-mono truncate">
                                                        {log.previous_entry_hash}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="text-right">
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(log.entry_timestamp_utc).toLocaleString()}
                                            </div>
                                            {log.digital_signature && (
                                                <div className="flex items-center gap-1 mt-1">
                                                    <Shield className="h-3 w-3 text-green-500" />
                                                    <span className="text-xs text-green-500">Signed</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))
                )}
            </motion.div>
        </div>
    );
}
