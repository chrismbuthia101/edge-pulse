"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { CheckCircle2, Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { useAuthStore } from "@/lib/stores/auth-store";
import { toast } from "sonner";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const store = useAuthStore.getState();
      await store.initialize();
      const currentUser = store.user;

      if (currentUser) {
        const { account_status } = await store.getProfileStatus(
          currentUser.id,
        );

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

  const handleSetPassword = async () => {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      const store = useAuthStore.getState();
      const passwordResult = await store.updatePassword(password);
      if (!passwordResult.success) throw new Error(passwordResult.error);

      const currentUser = store.user;
      if (currentUser) {
        await store.activateProfile(currentUser.id);
      }

      toast.success("Password set successfully! Redirecting to setup...");
      setTimeout(() => router.push("/onboarding/setup-profile"), 1500);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to set password",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!accepted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Logo className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold mb-2">
            Invalid or Expired Invite
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            This invitation link is invalid or has expired. Please contact your
            administrator for a new invitation.
          </p>
          <Button onClick={() => router.push("/auth/login")}>
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <pattern
            id="accept-grid"
            width="48"
            height="48"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="hsl(var(--grid-light))"
              strokeWidth="0.8"
              opacity="0.3"
            />
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="hsl(var(--grid-dark))"
              strokeWidth="0.4"
              opacity="0.2"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#accept-grid)" />
      </svg>

      <div className="relative z-10 w-full max-w-md mx-auto p-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="text-center"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground mb-1.5">
            You&apos;re Invited!
          </h1>
          <p className="text-muted-foreground text-sm mb-8">
            Set your password to activate your analyst account
          </p>

          <div className="space-y-4 text-left">
            <div className="space-y-1.5">
              <Label htmlFor="password">Create Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-10"
                  placeholder="Create a strong password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((p) => !p)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              onClick={handleSetPassword}
              disabled={isSubmitting || password.length < 8}
              className="w-full h-10 gap-2"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
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
  );
}
