"use client";

import { useState, useEffect, useCallback } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/types";

// Use the Database type to infer the row type
type EnrollmentToken = Database["public"]["Tables"]["device_enrollment_tokens"]["Row"];

export default function DeviceEnrollment() {
    const [tokens, setTokens] = useState<EnrollmentToken[]>([]);
    const [showToken, setShowToken] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newTokenName, setNewTokenName] = useState("");
    const [maxUses, setMaxUses] = useState(1);

    const supabase = createClient();

    const loadTokens = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("device_enrollment_tokens")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            setTokens(data ?? []);
        } catch {
            toast.error("Failed to load enrollment tokens");
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        loadTokens();
    }, [loadTokens]);

    const createToken = async () => {
        if (!newTokenName.trim()) {
            toast.error("Please enter a token name");
            return;
        }

        setCreating(true);
        try {
            const token = generateSecureToken();

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);

            const { data: userData } = await supabase.auth.getUser();
            const userId = userData.user?.id;

            if (!userId) throw new Error("User not authenticated");

            const { data, error } = await supabase
                .from("device_enrollment_tokens")
                .insert({
                    token_hash: await hashToken(token),
                    created_by: userId,
                    max_uses: maxUses,
                    current_uses: 0,
                    expires_at: expiresAt.toISOString(),
                })
                .select()
                .single();

            if (error) throw error;

            toast.success(`Token "${newTokenName}" created. Copied to clipboard.`);

            await navigator.clipboard.writeText(token);

            setNewTokenName("");
            setMaxUses(1);

            await loadTokens();

            if (data) {
                setShowToken(prev => ({ ...prev, [data.token_id]: true }));
            }

        } catch (err) {
            console.error(err);
            toast.error("Failed to create enrollment token");
        } finally {
            setCreating(false);
        }
    };

    const deleteToken = async (tokenId: string) => {
        try {
            const { error } = await supabase
                .from("device_enrollment_tokens")
                .delete()
                .eq("token_id", tokenId);

            if (error) throw error;

            toast.success("Enrollment token deleted");
            await loadTokens();
        } catch {
            toast.error("Failed to delete token");
        }
    };

    const copyToken = async (token: string) => {
        try {
            await navigator.clipboard.writeText(token);
            toast.success("Token copied to clipboard");
        } catch {
            toast.error("Failed to copy token");
        }
    };

    const generateSecureToken = () => {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return btoa(String.fromCharCode(...array))
            .replace(/[+/=]/g, "")
            .substring(0, 40);
    };

    const hashToken = async (token: string): Promise<string> => {
        const encoder = new TextEncoder();
        const data = encoder.encode(token);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const isExpired = (expiresAt: string) => {
        return new Date(expiresAt) < new Date();
    };

    const getUsagePercentage = (token: EnrollmentToken) => {
        return (token.current_uses / token.max_uses) * 100;
    };

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
                    onClick={loadTokens}
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
                            {tokens.map((token) => (
                                <motion.div
                                    key={token.token_id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="border border-border rounded-lg p-4"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h5 className="font-medium text-foreground">Token {token.token_id.substring(0, 8)}...</h5>
                                                {isExpired(token.expires_at) && (
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                                                        Expired
                                                    </span>
                                                )}
                                                {token.is_used && (
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
                                                        Used
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => copyToken("Token copied to clipboard")}
                                                className="gap-1"
                                            >
                                                <Copy className="h-3 w-3" />
                                                Copy
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setShowToken(prev => ({ ...prev, [token.token_id]: !prev[token.token_id] }))}
                                                className="gap-1"
                                            >
                                                {showToken[token.token_id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                                {showToken[token.token_id] ? "Hide" : "Show"}
                                            </Button>
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

                                    {/* Token Display */}
                                    <AnimatePresence>
                                        {showToken[token.token_id] && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-3 p-3 bg-muted/50 rounded-md border border-border"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-medium text-foreground">Enrollment Token</span>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => copyToken("Token copied to clipboard")}
                                                        className="gap-1 h-6"
                                                    >
                                                        <Copy className="h-3 w-3" />
                                                        Copy
                                                    </Button>
                                                </div>
                                                <div className="font-mono text-sm bg-card border border-border rounded p-2 break-all">
                                                    [Token not displayed - stored securely]
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-2">
                                                    ⚠️ Store this token securely. It will not be shown again.
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
                                                animate={{ width: `${Math.min(getUsagePercentage(token), 100)}%` }}
                                                transition={{ duration: 0.5 }}
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
