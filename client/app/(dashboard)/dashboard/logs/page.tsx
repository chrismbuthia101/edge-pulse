"use client";

import { useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
    Shield,
    AlertTriangle,
    CheckCircle,
    RefreshCw,
    Download,
    Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/useAuth";
import { useLogsStore } from "@/stores/logs-store";

export default function LogsPage() {
    const { hasRole } = useAuth();
    const {
        devices,
        selectedDevice,
        loading,
        verifying,
        verificationResult,
        searchTerm,
        entryTypeFilter,
        initialize,
        setSelectedDevice,
        setEntryTypeFilter,
        setSearchTerm,
        refreshLogs,
        verifyChain,
        exportLogs,
        getFilteredLogs
    } = useLogsStore();

    const filteredLogs = getFilteredLogs();

    useEffect(() => {
        document.title = "Logs - EdgePulse";
        initialize();
    }, [initialize]);

    const handleDeviceChange = useCallback((deviceId: string) => {
        setSelectedDevice(deviceId);
    }, [setSelectedDevice]);

    const handleEntryTypeChange = useCallback((filter: string) => {
        setEntryTypeFilter(filter);
    }, [setEntryTypeFilter]);

    const handleSearchChange = useCallback((term: string) => {
        setSearchTerm(term);
    }, [setSearchTerm]);

    if (!hasRole(["ANALYST", "ADMINISTRATOR"])) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold">Access Denied</h3>
                    <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
                </div>
            </div>
        );
    }

    const getEntryTypeIcon = (entryType: string) => {
        const icons: Record<string, React.ReactNode> = {
            'TELEMETRY': <Activity className="h-4 w-4" />,
            'ALERT': <AlertTriangle className="h-4 w-4" />,
            'DETECTION': <Shield className="h-4 w-4" />,
            'SYNC': <RefreshCw className="h-4 w-4" />,
            'SYSTEM': <CheckCircle className="h-4 w-4" />,
        };
        return icons[entryType] || <Activity className="h-4 w-4" />;
    };

    const getEntryTypeColor = (entryType: string): string => {
        const colors: Record<string, string> = {
            'TELEMETRY': 'text-blue-500',
            'ALERT': 'text-red-500',
            'DETECTION': 'text-orange-500',
            'SYNC': 'text-green-500',
            'SYSTEM': 'text-purple-500',
        };
        return colors[entryType] || 'text-gray-500';
    };

    const getEntryTypeLabel = (entryType: string): string => {
        const labels: Record<string, string> = {
            'TELEMETRY': 'Telemetry Data',
            'ALERT': 'Security Alert',
            'DETECTION': 'Anomaly Detection',
            'SYNC': 'Data Sync',
            'SYSTEM': 'System Event',
        };
        return labels[entryType] || entryType;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Tamper-Evident Logs</h1>
                    <p className="text-muted-foreground">
                        View and verify cryptographic log chains for all devices
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => refreshLogs()}
                        disabled={loading || selectedDevice === "all"}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                    <Button
                        onClick={() => exportLogs()}
                        disabled={selectedDevice === "all"}
                    >
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                    <Select value={selectedDevice} onValueChange={handleDeviceChange}>
                        <SelectTrigger>
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
                </div>
                <div className="flex-1">
                    <Select value={entryTypeFilter} onValueChange={handleEntryTypeChange}>
                        <SelectTrigger>
                            <SelectValue placeholder="Filter by type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="TELEMETRY">Telemetry</SelectItem>
                            <SelectItem value="ALERT">Alerts</SelectItem>
                            <SelectItem value="DETECTION">Detections</SelectItem>
                            <SelectItem value="SYNC">Sync</SelectItem>
                            <SelectItem value="SYSTEM">System</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex-1">
                    <Input
                        placeholder="Search logs..."
                        value={searchTerm}
                        onChange={(e) => handleSearchChange(e.target.value)}
                    />
                </div>
            </div>

            {/* Verification Status */}
            {verificationResult && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {verificationResult.is_valid ? (
                                    <CheckCircle className="h-8 w-8 text-green-500" />
                                ) : (
                                    <AlertTriangle className="h-8 w-8 text-red-500" />
                                )}
                                <div>
                                    <h3 className="font-semibold">
                                        Chain {verificationResult.is_valid ? "Valid" : "Invalid"}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {verificationResult.entries_checked} entries checked
                                    </p>
                                </div>
                            </div>
                            {!verificationResult.is_valid && verificationResult.break_reason && (
                                <div className="text-right">
                                    <p className="text-sm text-red-500">
                                        {verificationResult.break_reason}
                                    </p>
                                    {verificationResult.first_broken_sequence && (
                                        <p className="text-xs text-muted-foreground">
                                            Sequence: #{verificationResult.first_broken_sequence}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Logs List */}
            {loading ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-muted-foreground">Loading logs...</p>
                    </CardContent>
                </Card>
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
                <div className="space-y-4">
                    {filteredLogs.map((log, index) => (
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
                                                    {getEntryTypeLabel(log.log_entry_type)}
                                                </Badge>
                                                <span className="text-sm font-mono text-muted-foreground">
                                                    #{log.log_sequence_number}
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                                    <span>Timestamp: {new Date(log.entry_timestamp_utc).toLocaleString()}</span>
                                                </div>
                                                <div className="font-mono text-xs space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold">Content Hash:</span>
                                                        <span className="text-muted-foreground">{log.entry_content_hash}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold">Previous Hash:</span>
                                                        <span className="text-muted-foreground">{log.previous_entry_hash}</span>
                                                    </div>
                                                    {log.digital_signature && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold">Signature:</span>
                                                            <span className="text-muted-foreground">{log.digital_signature}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Verify Chain Button */}
            {selectedDevice !== "all" && (
                <div className="flex justify-center">
                    <Button
                        onClick={() => verifyChain()}
                        disabled={verifying}
                        size="lg"
                    >
                        <Shield className="h-4 w-4 mr-2" />
                        {verifying ? "Verifying..." : "Verify Chain Integrity"}
                    </Button>
                </div>
            )}
        </div>
    );
}
