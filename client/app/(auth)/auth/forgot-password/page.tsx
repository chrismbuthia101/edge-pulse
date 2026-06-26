"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Mail, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  AuthBrandMark,
  AuthPageBackground,
  AuthPanelChrome,
  ForgotPasswordVisual,
} from "@/components/auth/auth-visual-panel";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [focusedField, setFocusedField] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const result = await useAuthStore.getState().resetPassword(email, redirectTo);

    if (!result.success) {
      toast.error(result.error ?? "Failed to send reset email");
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    setSubmitted(true);
    toast.success("Password reset link sent to your email!");
  };

  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <AuthPageBackground variant="forgot-password" />

      {/* ── Left: visual panel (desktop only) ── */}
      <div className="hidden lg:block sticky top-0 h-screen">
        <AuthPanelChrome>
          <ForgotPasswordVisual />
        </AuthPanelChrome>
      </div>

      {/* ── Right: form panel ── */}
      <div className="flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="flex items-center px-6 sm:px-10 py-5">
          <div className="lg:hidden">
            <AuthBrandMark light />
          </div>
        </div>

        {/* Form area */}
        <div className="flex-1 flex flex-col px-6 sm:px-10 pb-10 lg:items-center lg:justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-100 mx-auto"
          >
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
                    <h1 className="text-3xl font-display font-bold text-foreground dark:text-white mb-2">
                      Reset password
                    </h1>
                    <p className="text-muted-foreground dark:text-slate-400 text-sm">
                      Enter your email and we&apos;ll send you a secure reset
                      link.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="email"
                        className="text-sm font-medium text-foreground dark:text-slate-200"
                      >
                        Email address
                      </Label>
                      <div className="relative">
                        <Mail
                          className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField ? "text-cyan-400" : "text-muted-foreground dark:text-slate-500"}`}
                        />
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@company.com"
                          className="pl-10 h-11 bg-background dark:bg-white/3 border-border dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-slate-500 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          onFocus={() => setFocusedField(true)}
                          onBlur={() => setFocusedField(false)}
                        />
                      </div>
                    <p className="text-xs text-muted-foreground dark:text-slate-500 pt-1">
                      If an account with this email exists, we&apos;ll send a
                      reset link to your inbox
                    </p>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-11 gap-2 bg-linear-to-r from-cyan-500 to-blue-600 text-white border-0 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:brightness-110 transition-all duration-200"
                      disabled={isLoading || !email}
                    >
                      {isLoading ? (
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          Send Reset Link
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </form>

                  <div className="mt-8 pt-6 border-t border-border dark:border-white/10 text-center">
                    <p className="text-sm text-muted-foreground dark:text-slate-400">
                      Remember your password?{" "}
                      <Link
                        href="/auth/login"
                        className="text-cyan-400 hover:text-cyan-300 font-medium"
                      >
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
                  transition={{
                    duration: 0.45,
                    type: "spring",
                    stiffness: 300,
                  }}
                  className="text-center"
                >
                  <motion.div
                    className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-6"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      delay: 0.1,
                      type: "spring",
                      stiffness: 400,
                    }}
                  >
                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  </motion.div>

                  <h2 className="text-2xl font-display font-bold text-foreground dark:text-white mb-2">
                    Check your inbox
                  </h2>
                  <p className="text-sm text-muted-foreground dark:text-slate-400 mb-2">
                    We sent a password reset link to
                  </p>
                  <p className="text-sm font-semibold text-foreground dark:text-white mb-6">
                    {email}
                  </p>

                  <div className="bg-background dark:bg-white/3 border border-border dark:border-white/10 rounded-xl px-5 py-4 text-left mb-6 space-y-1.5">
                    <p className="font-medium text-foreground dark:text-slate-200 text-xs uppercase tracking-widest mb-2">
                      What to do next
                    </p>
                    <p className="text-sm text-muted-foreground dark:text-slate-400">
                      1. Open the email from EdgePulse
                    </p>
                    <p className="text-sm text-muted-foreground dark:text-slate-400">
                      2. Click the &ldquo;Reset Password&rdquo; button
                    </p>
                    <p className="text-sm text-muted-foreground dark:text-slate-400">
                      3. Create a new strong password
                    </p>
                    <p className="text-xs text-muted-foreground dark:text-slate-500 pt-1">
                      The link expires in 1 hour.
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full h-11 border-border dark:border-white/15 bg-background dark:bg-white/3 text-foreground dark:text-white hover:bg-accent dark:hover:bg-white/[0.07] hover:text-accent-foreground dark:hover:text-white mb-3"
                    onClick={() => {
                      setSubmitted(false);
                      setEmail("");
                    }}
                  >
                    Use a different email
                  </Button>

                  <Button
                    variant="ghost"
                    className="w-full h-11 text-muted-foreground dark:text-slate-400 hover:text-foreground dark:hover:text-white"
                    asChild
                  >
                    <Link href="/auth/login">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to sign in
                    </Link>
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
