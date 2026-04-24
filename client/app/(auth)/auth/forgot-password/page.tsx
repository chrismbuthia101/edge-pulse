"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Mail, ArrowLeft, CheckCircle2, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
    const supabase = createClient();

    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [focusedField, setFocusedField] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${location.origin}/auth/reset-password`,
        });

        if (error) {
            toast.error(error.message);
            setIsLoading(false);
            return;
        }

        setIsLoading(false);
        setSubmitted(true);
        toast.success("Password reset link sent to your email!");
    };

    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            {/* Grid pattern */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                    <pattern id="forgot-password-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                        <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-light))" strokeWidth="0.8" opacity="0.3" />
                        <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-dark))" strokeWidth="0.4" opacity="0.2" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#forgot-password-grid)" />
            </svg>

            {/* Ambient glow */}
            <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-56 h-56 bg-violet-500/10 rounded-full blur-[80px] pointer-events-none" />

            <div className="relative z-10 min-h-screen flex">
                {/* Left decorative panel */}
                <div className="hidden lg:flex lg:w-[52%] relative">
                    {/* Logo */}
                    <div className="absolute top-8 left-8 flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                            <Logo className="h-5 w-5 text-primary" />
                        </div>
                        <span className="text-xl font-display font-bold text-foreground">
                            Edge<span className="text-primary">Pulse</span>
                        </span>
                    </div>

                    {/* Center visual - envelope animation */}
                    <div className="absolute top-24 left-12 right-12 bottom-24 flex items-center justify-center">
                        <div className="relative flex flex-col items-center text-center max-w-sm px-8">
                            {/* Envelope visual */}
                            <div className="relative mb-8">
                                {/* Outer glow rings */}
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
                                    animate={{ y: [0, -8, 0] }}
                                    transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                                >
                                    <Mail className="w-12 h-12 text-primary" />
                                </motion.div>

                                {/* Floating dots */}
                                {[
                                    { x: 50, y: -20, delay: 0 },
                                    { x: -40, y: 10, delay: 0.6 },
                                    { x: 60, y: 30, delay: 1.2 },
                                ].map((dot, i) => (
                                    <motion.div
                                        key={i}
                                        className="absolute w-2 h-2 rounded-full bg-primary/50"
                                        style={{ right: dot.x < 0 ? undefined : -dot.x, left: dot.x < 0 ? -dot.x : undefined, top: dot.y }}
                                        animate={{ scale: [0, 1, 0], opacity: [0, 0.7, 0] }}
                                        transition={{ duration: 2, repeat: Infinity, delay: dot.delay }}
                                    />
                                ))}
                            </div>

                            <h2 className="text-2xl font-display font-bold text-foreground mb-3">
                                Account recovery
                            </h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                We&apos;ll send a secure link to your email address. The link expires after 1 hour for your safety.
                            </p>

                            <div className="mt-8 flex flex-col gap-2 w-full">
                                {[
                                    "Secure, time-limited reset link",
                                    "No password sent via email",
                                    "Link expires after 1 hour",
                                ].map((item) => (
                                    <div key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                                        {item}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right form panel */}
                <div className="flex-1 flex flex-col">
                    {/* Top bar */}
                    <div className="flex items-center justify-between px-8 py-5">
                        {/* Mobile logo */}
                        <Link href="/" className="flex items-center gap-2 lg:hidden">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <Logo className="h-4 w-4 text-primary" />
                            </div>
                            <span className="text-lg font-display font-bold">
                                Edge<span className="text-primary">Pulse</span>
                            </span>
                        </Link>
                        <div className="hidden lg:block" />
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="sm" asChild>
                                <Link href="/auth/login">
                                    <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                                    Back to login
                                </Link>
                            </Button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex items-center justify-center p-8">
                        <div className="w-full max-w-[400px]">
                            <AnimatePresence mode="wait">
                                {!submitted ? (
                                    <motion.div
                                        key="form"
                                        initial={{ opacity: 0, y: 24 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -24 }}
                                        transition={{ duration: 0.45 }}
                                    >
                                        <div className="mb-8">
                                            <h1 className="text-3xl font-display font-bold text-foreground mb-1.5">
                                                Reset password
                                            </h1>
                                            <p className="text-sm text-muted-foreground">
                                                Enter your email and we&apos;ll send you a secure reset link.
                                            </p>
                                        </div>

                                        <form onSubmit={handleSubmit} className="space-y-5">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="email">Email address</Label>
                                                <div className="relative">
                                                    <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField ? "text-primary" : "text-muted-foreground"}`} />
                                                    <Input
                                                        id="email"
                                                        type="email"
                                                        placeholder="you@company.com"
                                                        className="pl-10 h-10"
                                                        value={email}
                                                        onChange={(e) => setEmail(e.target.value)}
                                                        required
                                                        onFocus={() => setFocusedField(true)}
                                                        onBlur={() => setFocusedField(false)}
                                                    />
                                                </div>
                                                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                                                    <p className="text-xs text-blue-700 dark:text-blue-300">
                                                        If an account with this email exists, we&apos;ll send a reset link to your inbox
                                                    </p>
                                                </div>
                                            </div>

                                            <Button type="submit" className="w-full h-10 gap-2" disabled={isLoading || !email}>
                                                {isLoading ? (
                                                    <motion.div
                                                        className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                                                        animate={{ rotate: 360 }}
                                                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                    />
                                                ) : (
                                                    <>
                                                        Send Reset Link
                                                        <ArrowRight className="h-4 w-4" />
                                                    </>
                                                )}
                                            </Button>
                                        </form>

                                        <div className="mt-8 pt-6 border-t border-border text-center">
                                            <p className="text-sm text-muted-foreground">
                                                Remember your password?{" "}
                                                <Link href="/auth/login" className="text-primary hover:underline underline-offset-4">
                                                    Sign in
                                                </Link>
                                            </p>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="success"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ duration: 0.45, type: "spring", stiffness: 300 }}
                                        className="text-center"
                                    >
                                        {/* Success icon */}
                                        <motion.div
                                            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-6"
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: 0.1, type: "spring", stiffness: 400 }}
                                        >
                                            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                                        </motion.div>

                                        <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                                            Check your inbox
                                        </h2>
                                        <p className="text-sm text-muted-foreground mb-2">
                                            We sent a password reset link to
                                        </p>
                                        <p className="text-sm font-semibold text-foreground mb-6">
                                            {email}
                                        </p>

                                        <div className="bg-muted/50 border border-border rounded-xl px-5 py-4 text-sm text-muted-foreground text-left mb-6 space-y-1.5">
                                            <p className="font-medium text-foreground text-xs uppercase tracking-widest mb-2">What to do next</p>
                                            <p>1. Open the email from EdgePulse</p>
                                            <p>2. Click the &ldquo;Reset Password&rdquo; button</p>
                                            <p>3. Create a new strong password</p>
                                            <p className="text-xs text-muted-foreground/70 pt-1">The link expires in 1 hour.</p>
                                        </div>

                                        <Button variant="outline" className="w-full h-10 mb-3" onClick={() => { setSubmitted(false); setEmail(""); }}>
                                            Use a different email
                                        </Button>
                                        <Button variant="ghost" className="w-full h-10" asChild>
                                            <Link href="/auth/login">
                                                <ArrowLeft className="h-4 w-4 mr-2" />
                                                Back to sign in
                                            </Link>
                                        </Button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
