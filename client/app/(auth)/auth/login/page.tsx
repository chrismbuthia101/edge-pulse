"use client";

import { useState, useRef, Suspense } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { resolvePostLoginRoute, useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import {
  AuthBrandMark,
  AuthPageBackground,
  AuthPanelChrome,
  LoginVisual,
} from "@/components/auth/auth-visual-panel";

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const form = new FormData(e.currentTarget);
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    const result = await useAuthStore.getState().signIn(email, password, captchaToken ?? undefined);

    captchaRef.current?.resetCaptcha();
    setCaptchaToken(null);

    if (!result.success) {
      toast.error(result.error ?? "Failed to sign in");
      setIsLoading(false);
      return;
    }

    const next = searchParams.get("next") ?? undefined;
    const {
      profiles: currentProfiles,
      activeOrganizationId: currentOrgId,
      profileFetchFailed,
    } = useAuthStore.getState();
    const destination = resolvePostLoginRoute(
      currentProfiles,
      currentOrgId,
      next,
      profileFetchFailed,
    );

    setIsLoading(false);
    toast.success("Login successful!");
    router.push(destination);
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);

    const next = searchParams.get("next") ?? undefined;
    const callbackTarget = next
      ? `/auth/resolve?next=${encodeURIComponent(next)}`
      : "/auth/resolve";

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      callbackTarget,
    )}`;
    const result = await useAuthStore.getState().signInWithGoogle(redirectTo);

    if (!result.success) {
      toast.error(result.error ?? "Failed to sign in with Google");
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <AuthPageBackground variant="login" />

      {/* ── Left: live product visual (desktop only) ── */}
      <div className="hidden lg:block sticky top-0 h-screen">
        <AuthPanelChrome>
          <LoginVisual />
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
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-display font-bold text-foreground dark:text-white mb-2">
                Welcome back
              </h1>
              <p className="text-muted-foreground dark:text-slate-400 text-sm">
                Sign in to your EdgePulse account
              </p>
            </div>

            {/* Google OAuth */}
            <Button
              variant="outline"
              type="button"
              className="w-full h-11 mb-6 gap-2.5 border-border dark:border-white/15 bg-background dark:bg-white/3 text-foreground dark:text-white hover:bg-accent dark:hover:bg-white/[0.07] hover:text-accent-foreground dark:hover:text-white"
              onClick={handleGoogleLogin}
              disabled={isGoogleLoading || isLoading}
            >
              {isGoogleLoading ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              Continue with Google
            </Button>

            {/* Divider */}
            <div className="relative mb-6 flex items-center gap-3">
              <div className="flex-1 h-px bg-border dark:bg-white/10" />
              <span className="text-[11px] text-muted-foreground dark:text-slate-500 uppercase tracking-wider font-mono">
                or sign in with email
              </span>
              <div className="flex-1 h-px bg-border dark:bg-white/10" />
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium text-foreground dark:text-slate-200"
                >
                  Email address
                </Label>
                <div className="relative">
                  <Mail
                    className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField === "email" ? "text-cyan-400" : "text-muted-foreground dark:text-slate-500"}`}
                  />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    className="pl-10 h-11 bg-background dark:bg-white/3 border-border dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-slate-500 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
                    required
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="password"
                    className="text-sm font-medium text-foreground dark:text-slate-200"
                  >
                    Password
                  </Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline underline-offset-4"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock
                    className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField === "password" ? "text-cyan-400" : "text-muted-foreground dark:text-slate-500"}`}
                  />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    className="pl-10 pr-10 h-11 bg-background dark:bg-white/3 border-border dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-slate-500 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
                    required
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-slate-500 hover:text-foreground dark:hover:text-slate-300 transition-colors"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  className="border-border dark:border-white/20 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                />
                <Label
                  htmlFor="remember"
                  className="text-sm font-normal text-muted-foreground dark:text-slate-400 cursor-pointer"
                >
                  Keep me signed in for 30 days
                </Label>
              </div>

              {/* CAPTCHA */}
              <HCaptcha
                ref={captchaRef}
                sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY!}
                onVerify={(token) => setCaptchaToken(token)}
              />

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-11 gap-2 bg-linear-to-r from-cyan-500 to-blue-600 text-white border-0 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:brightness-110 transition-all duration-200"
                disabled={isLoading || !captchaToken}
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground dark:text-slate-400 mt-6">
              No account?{" "}
              <Link
                href="/auth/register"
                className="text-cyan-400 hover:text-cyan-300 font-medium"
              >
                Create account
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPageWrapper() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
