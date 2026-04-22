"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Plus,
    Copy,
    Trash2,
    Eye,
    EyeOff,
    Shield,
    Calendar,
    Monitor,
    RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeviceEnrollmentStore } from "@/lib/stores/device-enrollment-store";
import { toast } from "sonner";
import type { EnrollmentToken } from "@/lib/supabase/types";

export function DeviceEnrollment() {
    const {
        tokens,
        loading,
        creating,
        initialize,
        refreshTokens,
        createToken: createTokenFromStore,
        deleteToken: deleteTokenFromStore,
        getTokenSecret,
    } = useDeviceEnrollmentStore();

    const [showTokenSecret, setShowTokenSecret] = useState<Record<string, boolean>>({});
    const [newTokenName, setNewTokenName] = useState("");
    const [maxUses, setMaxUses] = useState(1);

    useEffect(() => {
        initialize();
    }, [initialize]);

    const createToken = async () => {
        const result = await createTokenFromStore(newTokenName, maxUses);
        if (result) {
            setNewTokenName("");
            setMaxUses(1);
            // Show the newly created token's secret
            setShowTokenSecret(prev => ({ ...prev, [result.tokenId]: true }));
        }
    };

    const deleteToken = async (tokenId: string) => {
        await deleteTokenFromStore(tokenId);
    };

    const copyToClipboard = async (text: string, description: string = "Token") => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${description} copied to clipboard`);
        } catch {
            toast.error(`Failed to copy ${description.toLowerCase()}`);
        }
    };

    const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

    const getUsagePercentage = (token: EnrollmentToken) =>
        (token.current_uses / token.max_uses) * 100;

    const isTokenUsable = (token: EnrollmentToken) =>
        !isExpired(token.expires_at) && token.current_uses < token.max_uses;

    return (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Device Enrollment</h3>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshTokens}
                    disabled={loading}
                    className="gap-1.5"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            <div className="p-5 space-y-6">
                {/* Create New Token */}
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-foreground">Create Enrollment Token</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="tokenName">Token Name</Label>
                            <Input
                                id="tokenName"
                                placeholder="e.g., Office Laptops"
                                value={newTokenName}
                                onChange={(e) => setNewTokenName(e.target.value)}
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="maxUses">Max Uses</Label>
                            <Input
                                id="maxUses"
                                type="number"
                                min="1"
                                max="100"
                                value={maxUses}
                                onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
                                className="h-9"
                            />
                        </div>
                        <div className="flex items-end">
                            <Button
                                onClick={createToken}
                                disabled={creating || !newTokenName.trim()}
                                className="gap-1.5 w-full"
                            >
                                {creating ? (
                                    <>
                                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="h-3.5 w-3.5" />
                                        Create Token
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Existing Tokens */}
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-foreground">Active Tokens</h4>

                    {loading ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Loading enrollment tokens...
                        </div>
                    ) : tokens.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No enrollment tokens created yet</p>
                            <p className="text-xs mt-1">Create a token to enroll new devices</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {tokens.map((token) => {
                                const tokenSecret = getTokenSecret(token.token_id);
                                const isShowingSecret = showTokenSecret[token.token_id];
                                const canShowSecret = !!tokenSecret;

                                return (
                                    <motion.div
                                        key={token.token_id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="border border-border rounded-lg p-4"
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <h5 className="font-medium text-foreground truncate">
                                                        {token.name || `Token ${token.token_id.substring(0, 8)}...`}
                                                    </h5>
                                                    {!isTokenUsable(token) && (
                                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                                                            {isExpired(token.expires_at) ? "Expired" : "Exhausted"}
                                                        </span>
                                                    )}
                                                    {token.is_used && isTokenUsable(token) && (
                                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
                                                            Active
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        Expires {new Date(token.expires_at).toLocaleDateString()}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Monitor className="h-3 w-3" />
                                                        {token.current_uses}/{token.max_uses} uses
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {canShowSecret && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() =>
                                                            setShowTokenSecret(prev => ({
                                                                ...prev,
                                                                [token.token_id]: !prev[token.token_id],
                                                            }))
                                                        }
                                                        className="gap-1"
                                                    >
                                                        {isShowingSecret ? (
                                                            <EyeOff className="h-3 w-3" />
                                                        ) : (
                                                            <Eye className="h-3 w-3" />
                                                        )}
                                                        {isShowingSecret ? "Hide" : "Show"}
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => deleteToken(token.token_id)}
                                                    className="gap-1 text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                    Delete
                                                </Button>
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {isShowingSecret && tokenSecret && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: "auto" }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="mt-3 p-3 bg-muted/50 rounded-md border border-border"
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-medium text-foreground">
                                                            Enrollment Token (Secret)
                                                        </span>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => copyToClipboard(tokenSecret, "Enrollment token")}
                                                            className="gap-1 h-6"
                                                        >
                                                            <Copy className="h-3 w-3" />
                                                            Copy
                                                        </Button>
                                                    </div>
                                                    <div className="font-mono text-sm bg-card border border-border rounded p-2 break-all">
                                                        {tokenSecret}
                                                    </div>
                                                    <p className="text-xs text-amber-600 mt-2">
                                                        ⚠️ This secret token is only shown once at creation. Store it securely for agent enrollment.
                                                    </p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        {/* Usage Progress */}
                                        <div className="mt-3">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs text-muted-foreground">Usage</span>
                                                <span className="text-xs font-medium">
                                                    {getUsagePercentage(token).toFixed(0)}%
                                                </span>
                                            </div>
                                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                                <motion.div
                                                    className={`h-full rounded-full ${getUsagePercentage(token) >= 100
                                                        ? "bg-red-500"
                                                        : getUsagePercentage(token) >= 75
                                                            ? "bg-amber-500"
                                                            : "bg-green-500"
                                                        }`}
                                                    initial={{ width: 0 }}
                                                    animate={{
                                                        width: `${Math.min(getUsagePercentage(token), 100)}%`,
                                                    }}
                                                    transition={{ duration: 0.5 }}
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default DeviceEnrollment;