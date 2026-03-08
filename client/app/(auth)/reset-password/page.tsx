"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff, CheckCircle2, Circle, ArrowRight, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { toast } from "sonner";

const passwordRequirements = [
    { id: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
    { id: "uppercase", label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
    { id: "lowercase", label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
    { id: "number", label: "One number", test: (p: string) => /\d/.test(p) },
    { id: "special", label: "One special character", test: (p: string) => /[!@#$%^&*]/.test(p) },
];

const strengthLabels = ["", "Weak", "Fair", "Good", "Strong", "Excellent"];
const strengthColors = ["", "bg-destructive", "bg-orange-500", "bg-amber-500", "bg-emerald-500", "bg-primary"];
const strengthTextColors = ["", "text-destructive", "text-orange-500", "text-amber-500", "text-emerald-500", "text-primary"];

export default function ResetPasswordPage() {
    const supabase = createClient();
    const router = useRouter();

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [focusedField, setFocusedField] = useState<string | null>(null);

    const passwordStrength = passwordRequirements.filter((r) => r.test(password)).length;
    const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
    const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (password !== confirmPassword) { toast.error("Passwords do not match"); return; }
        if (passwordStrength < 3) { toast.error("Password is too weak"); return; }

        setIsLoading(true);

        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
            toast.error(error.message);
            setIsLoading(false);
            return;
        }

        setSuccess(true);
        toast.success("Password updated successfully!");
        setTimeout(() => {
            router.push("/login");
            router.refresh();
        }, 2500);
    };

    return (
        <div className="min-h-screen flex bg-background">
            {/* ── Left decorative panel ── */}
            <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-muted/20 border-r border-border items-center justify-center">
                {/* Grid */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <defs>
                        <pattern id="rp-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--border))" strokeWidth="0.6" opacity="0.5" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#rp-grid)" />
                </svg>
                <div className="absolute top-1/4 left-1/3 w-72 h-72 bg-primary/8 rounded-full blur-[90px] pointer-events-none" />

                {/* Logo */}
                <div className="absolute top-8 left-8 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Logo className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-xl font-display font-bold text-foreground">
                        Edge<span className="text-primary">Pulse</span>
                    </span>
                </div>

                {/* Center visual — lock */}
                <div className="relative z-10 flex flex-col items-center text-center max-w-sm px-8">
                    <div className="relative mb-8">
                        {[1, 2].map((ring) => (
                            <motion.div
                                key={ring}
                                className="absolute inset-0 rounded-2xl border border-primary/15"
                                style={{ margin: `-${ring * 14}px` }}
                                animate={{ opacity: [0.3, 0.6, 0.3] }}
                                transition={{ duration: 2.5 + ring, repeat: Infinity, delay: ring * 0.5 }}
                            />
                        ))}
                        <motion.div
                            className="w-24 h-24 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center shadow-xl shadow-primary/10"
                            animate={{ scale: [1, 1.05, 1] }}
                            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                        >
                            <Lock className="w-12 h-12 text-primary" />
                        </motion.div>
                    </div>

                    <h2 className="text-2xl font-display font-bold text-foreground mb-3">
                        Set a new password
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-8">
                        Create a strong, unique password that you don&apos;t use anywhere else.
                    </p>

                    {/* Password tips */}
                    <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl p-5 w-full text-left space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                            Password tips
                        </p>
                        {[
                            "Use a passphrase — 4+ random words",
                            "Avoid birthdays or common words",
                            "Never reuse passwords across sites",
                            "Consider a password manager",
                        ].map((tip) => (
                            <div key={tip} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                                <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                                {tip}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Right form panel ── */}
            <div className="flex-1 flex flex-col">
                {/* Top bar */}
                <div className="flex items-center justify-between px-8 py-5">
                    <Link href="/" className="flex items-center gap-2 lg:hidden">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                            <Logo className="h-4 w-4 text-primary" />
                        </div>
                        <span className="text-lg font-display font-bold">
                            Edge<span className="text-primary">Pulse</span>
                        </span>
                    </Link>
                    <div className="hidden lg:block" />
                </div>

                {/* Content */}
                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="w-full max-w-[400px]">
                        <AnimatePresence mode="wait">
                            {!success ? (
                                <motion.div
                                    key="form"
                                    initial={{ opacity: 0, y: 24 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -24 }}
                                    transition={{ duration: 0.45 }}
                                >
                                    <div className="mb-8">
                                        <h1 className="text-3xl font-display font-bold text-foreground mb-1.5">
                                            New password
                                        </h1>
                                        <p className="text-sm text-muted-foreground">
                                            Choose a strong password to secure your account.
                                        </p>
                                    </div>

                                    <form onSubmit={handleSubmit} className="space-y-5">
                                        {/* New Password */}
                                        <div className="space-y-1.5">
                                            <Label>New Password</Label>
                                            <div className="relative">
                                                <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField === "password" ? "text-primary" : "text-muted-foreground"}`} />
                                                <Input
                                                    type={showPassword ? "text" : "password"}
                                                    className="pl-10 pr-10 h-10"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    placeholder="Enter new password"
                                                    required
                                                    onFocus={() => setFocusedField("password")}
                                                    onBlur={() => setFocusedField(null)}
                                                />
                                                <button
                                                    type="button"
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                                    onClick={() => setShowPassword((p) => !p)}
                                                >
                                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>

                                            {/* Strength indicator */}
                                            <AnimatePresence>
                                                {password.length > 0 && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: "auto" }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className="space-y-2 pt-1"
                                                    >
                                                        <div className="flex gap-1">
                                                            {[1, 2, 3, 4, 5].map((s) => (
                                                                <div key={s} className="flex-1 h-1 rounded-full overflow-hidden bg-muted">
                                                                    <motion.div
                                                                        className={`h-full rounded-full ${s <= passwordStrength ? strengthColors[passwordStrength] : ""}`}
                                                                        initial={{ width: 0 }}
                                                                        animate={{ width: s <= passwordStrength ? "100%" : "0%" }}
                                                                        transition={{ duration: 0.25, delay: s * 0.04 }}
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <span className={`text-xs font-medium ${strengthTextColors[passwordStrength]}`}>
                                                                {strengthLabels[passwordStrength]}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">{passwordStrength}/5</span>
                                                        </div>

                                                        {/* Checklist */}
                                                        <div className="grid grid-cols-1 gap-1 pt-1">
                                                            {passwordRequirements.map((req) => {
                                                                const met = req.test(password);
                                                                return (
                                                                    <div key={req.id} className="flex items-center gap-2">
                                                                        {met ? (
                                                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                                                        ) : (
                                                                            <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                                                                        )}
                                                                        <span className={`text-xs transition-colors ${met ? "text-foreground" : "text-muted-foreground"}`}>
                                                                            {req.label}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        {/* Confirm Password */}
                                        <div className="space-y-1.5">
                                            <Label>Confirm New Password</Label>
                                            <div className="relative">
                                                <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField === "confirm"
                                                    ? "text-primary"
                                                    : passwordsMatch
                                                        ? "text-emerald-500"
                                                        : passwordsMismatch
                                                            ? "text-destructive"
                                                            : "text-muted-foreground"
                                                    }`} />
                                                <Input
                                                    type={showConfirmPassword ? "text" : "password"}
                                                    className={`pl-10 pr-10 h-10 transition-colors ${passwordsMatch
                                                        ? "border-emerald-500/50 focus-visible:border-emerald-500"
                                                        : passwordsMismatch
                                                            ? "border-destructive/50 focus-visible:border-destructive"
                                                            : ""
                                                        }`}
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    placeholder="Repeat new password"
                                                    required
                                                    onFocus={() => setFocusedField("confirm")}
                                                    onBlur={() => setFocusedField(null)}
                                                />
                                                <button
                                                    type="button"
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                                    onClick={() => setShowConfirmPassword((p) => !p)}
                                                >
                                                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>

                                            <AnimatePresence>
                                                {passwordsMismatch && (
                                                    <motion.p
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: "auto" }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className="text-xs text-destructive"
                                                    >
                                                        Passwords do not match
                                                    </motion.p>
                                                )}
                                                {passwordsMatch && (
                                                    <motion.p
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: "auto" }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className="text-xs text-emerald-500"
                                                    >
                                                        Passwords match ✓
                                                    </motion.p>
                                                )}
                                            </AnimatePresence>
                                        </div>


                                        {/* Submit */}
                                        <Button
                                            type="submit"
                                            className="w-full h-10 gap-2"
                                            disabled={isLoading || passwordsMismatch || passwordStrength < 3 || !confirmPassword}
                                        >
                                            {isLoading ? (
                                                <motion.div
                                                    className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                                                    animate={{ rotate: 360 }}
                                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                />
                                            ) : (
                                                <>
                                                    Update Password
                                                    <ArrowRight className="h-4 w-4" />
                                                </>
                                            )}
                                        </Button>
                                    </form>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="success"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.45, type: "spring", stiffness: 300 }}
                                    className="text-center"
                                >
                                    {/* Success animation */}
                                    <motion.div
                                        className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-6"
                                        initial={{ scale: 0, rotate: -10 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ delay: 0.1, type: "spring", stiffness: 400 }}
                                    >
                                        <ShieldCheck className="w-10 h-10 text-emerald-500" />
                                    </motion.div>

                                    <motion.h2
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2 }}
                                        className="text-2xl font-display font-bold text-foreground mb-2"
                                    >
                                        Password updated!
                                    </motion.h2>
                                    <motion.p
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 }}
                                        className="text-sm text-muted-foreground mb-8"
                                    >
                                        Your password has been changed successfully. Redirecting you to login…
                                    </motion.p>

                                    {/* Progress bar */}
                                    <motion.div className="w-full h-1 bg-muted rounded-full overflow-hidden mb-6">
                                        <motion.div
                                            className="h-full bg-emerald-500 rounded-full"
                                            initial={{ width: 0 }}
                                            animate={{ width: "100%" }}
                                            transition={{ duration: 2.5, ease: "linear" }}
                                        />
                                    </motion.div>

                                    <Button variant="outline" className="w-full h-10" asChild>
                                        <Link href="/dashboard">Go to dashboard now</Link>
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}