"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { CheckCircle2, Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/lib/stores/auth-store";
import { toast } from "sonner";
import {
  AuthBrandMark,
  AuthPageBackground,
  AuthPanelChrome,
  AcceptInviteVisual,
} from "@/components/auth/auth-visual-panel";
import {
  PasswordStrength,
  getPasswordStrength,
} from "@/components/auth/password-strength";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordStrength = getPasswordStrength(password);

  useEffect(() => {
    const checkSession = async () => {
      const store = useAuthStore.getState();
      await store.initialize();
      const currentUser = store.user;

      if (currentUser) {
        const { account_status } = await store.getProfileStatus(currentUser.id);

        if (account_status === "PENDING") {
          setAccepted(true);
        } else if (account_status === "ACTIVE") {
          router.push("/dashboard");
        }
      }
      setChecking(false);
    };
    checkSession();
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-background dark:bg-[#020617] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  if (!accepted) {
    return (
      <div className="min-h-screen bg-background dark:bg-[#020617] flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 rounded-full bg-background dark:bg-white/5 flex items-center justify-center mx-auto mb-4 border border-border dark:border-white/10">
            <div className="h-6 w-6 rounded bg-muted-foreground dark:bg-slate-600" />
          </div>
          <h1 className="text-xl font-display font-bold text-foreground dark:text-white mb-2">
            Invalid or Expired Invite
          </h1>
          <p className="text-sm text-muted-foreground dark:text-slate-400 mb-6">
            This invitation link is invalid or has expired. Please contact your
            administrator for a new invitation.
          </p>
          <Button
            onClick={() => router.push("/auth/login")}
            className="bg-linear-to-r from-cyan-500 to-blue-600 text-white border-0 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:brightness-110 transition-all duration-200"
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <AuthPageBackground variant="accept-invite" />

      {/* ── Left: visual panel (desktop only) ── */}
      <div className="hidden lg:block sticky top-0 h-screen">
        <AuthPanelChrome>
          <AcceptInviteVisual />
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
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
              </div>
              <h1 className="text-3xl font-display font-bold text-foreground dark:text-white mb-2">
                You&apos;re Invited!
              </h1>
              <p className="text-muted-foreground dark:text-slate-400 text-sm">
                Set your password to activate your analyst account
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="text-sm font-medium text-foreground dark:text-slate-200"
                >
                  Create Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground dark:text-slate-500" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-11 bg-background dark:bg-white/3 border-border dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-slate-500 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
                    placeholder="Create a strong password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-slate-500 hover:text-foreground dark:hover:text-slate-300 transition-colors"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <PasswordStrength password={password} confirmPassword="" />
              </div>

              <Button
                onClick={async () => {
                  if (password.length < 8) {
                    toast.error("Password must be at least 8 characters");
                    return;
                  }

                  setIsSubmitting(true);
                  try {
                    const store = useAuthStore.getState();
                    const passwordResult = await store.updatePassword(password);
                    if (!passwordResult.success)
                      throw new Error(passwordResult.error);

                    const currentUser = store.user;
                    if (currentUser) {
                      await store.activateProfile(currentUser.id);
                    }

                    toast.success(
                      "Password set successfully! Redirecting to setup...",
                    );
                    setTimeout(
                      () => router.push("/onboarding/setup-profile"),
                      1500,
                    );
                  } catch (err) {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Failed to set password",
                    );
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting || passwordStrength < 3}
                className="w-full h-11 gap-2 bg-linear-to-r from-cyan-500 to-blue-600 text-white border-0 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:brightness-110 transition-all duration-200 disabled:opacity-40 disabled:shadow-none"
              >
                {isSubmitting ? (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Activate Account
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
