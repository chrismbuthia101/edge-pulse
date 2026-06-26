"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  AuthBrandMark,
  AuthPageBackground,
  AuthPanelChrome,
  RegisterVisual,
} from "@/components/auth/auth-visual-panel";
import {
  PasswordStrength,
  passwordRequirements,
  getPasswordStrength,
} from "@/components/auth/password-strength";

export default function RegisterPage() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const passwordStrength = getPasswordStrength(password);
  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setPasswordError(null);
    setEmailError(null);
    setNameError(null);

    const form = new FormData(e.currentTarget);
    const fullName = form.get("name") as string;
    const email = form.get("email") as string;

    if (!fullName || fullName.trim().length < 2) {
      setNameError("Name must be at least 2 characters long");
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email || !emailRegex.test(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    if (passwordStrength < 3) {
      setPasswordError(
        "Password is too weak. Please meet at least 3 requirements.",
      );
      return;
    }

    setIsLoading(true);

    const redirectTo = `${window.location.origin}/auth/login`;
    const result = await useAuthStore
      .getState()
      .signUp(email, password, fullName, redirectTo);

    setIsLoading(false);

    if (!result.success) {
      const errorMsg = (result.error ?? "").toLowerCase();

      if (
        errorMsg.includes("rate limit") ||
        errorMsg.includes("over_email_send_rate_limit")
      ) {
        toast.error("Too many attempts. Please try again in 15 minutes.", {
          duration: 5000,
        });
        return;
      }

      if (
        errorMsg.includes("user already registered") ||
        errorMsg.includes("already exists")
      ) {
        toast.error("This email is already registered. Please log in instead.");
        return;
      }

      if (errorMsg.includes("email") && !errorMsg.includes("already")) {
        setEmailError(result.error ?? "Invalid email");
      } else if (errorMsg.includes("password")) {
        setPasswordError(result.error ?? "Invalid password");
      } else {
        toast.error(result.error ?? "Failed to sign up");
      }
      return;
    }

    toast.success(
      "Account created successfully! Please check your email to verify your account, then sign in.",
    );
    setTimeout(() => {
      router.push("/auth/login");
      router.refresh();
    }, 2000);
  };

  const validateName = (name: string) => {
    if (!name || name.trim().length < 2) {
      setNameError("Name must be at least 2 characters long");
    } else {
      setNameError(null);
    }
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email || !emailRegex.test(email)) {
      setEmailError("Please enter a valid email address");
    } else {
      setEmailError(null);
    }
  };

  const validatePassword = (pwd: string) => {
    const strength = passwordRequirements.filter((r) => r.test(pwd)).length;
    if (pwd.length > 0 && strength < 3) {
      setPasswordError(
        "Password is too weak. Please meet at least 3 requirements.",
      );
    } else {
      setPasswordError(null);
    }
  };

  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <AuthPageBackground variant="register" />

      {/* ── Right: form panel ── */}
      <div className="flex flex-col min-h-screen lg:order-2">
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
            className="w-full max-w-105 mx-auto"
          >
            <div className="mb-7">
              <h1 className="text-3xl font-display font-bold text-foreground dark:text-white mb-2">
                Create your account
              </h1>
              <p className="text-muted-foreground dark:text-slate-400 text-sm">
                Join EdgePulse — secure your infrastructure from day one
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4.5">
              {/* Full name */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="name"
                  className="text-sm font-medium text-foreground dark:text-slate-200"
                >
                  Full name
                </Label>
                <div className="relative">
                  <User
                    className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField === "name" ? "text-cyan-400" : nameError ? "text-red-400" : "text-muted-foreground dark:text-slate-500"}`}
                  />
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="Jane Smith"
                    className={`pl-10 h-11 bg-background dark:bg-white/3 border-border dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-slate-500 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20 ${nameError ? "border-red-500/50" : ""}`}
                    required
                    onFocus={() => setFocusedField("name")}
                    onBlur={(e) => {
                      setFocusedField(null);
                      validateName(e.target.value);
                    }}
                    onChange={(e) => {
                      if (nameError) validateName(e.target.value);
                    }}
                  />
                </div>
                {nameError && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-red-400"
                  >
                    {nameError}
                  </motion.p>
                )}
              </div>

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
                    className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField === "email" ? "text-cyan-400" : emailError ? "text-red-400" : "text-muted-foreground dark:text-slate-500"}`}
                  />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    className={`pl-10 h-11 bg-background dark:bg-white/3 border-border dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-slate-500 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20 ${emailError ? "border-red-500/50" : ""}`}
                    required
                    onFocus={() => setFocusedField("email")}
                    onBlur={(e) => {
                      setFocusedField(null);
                      validateEmail(e.target.value);
                    }}
                    onChange={(e) => {
                      if (emailError) validateEmail(e.target.value);
                    }}
                  />
                </div>
                {emailError && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-red-400"
                  >
                    {emailError}
                  </motion.p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground dark:text-slate-200">
                  Password
                </Label>
                <div className="relative">
                  <Lock
                    className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField === "password" ? "text-cyan-400" : passwordError ? "text-red-400" : "text-muted-foreground dark:text-slate-500"}`}
                  />
                  <Input
                    type={showPassword ? "text" : "password"}
                    className={`pl-10 pr-10 h-11 bg-background dark:bg-white/3 border-border dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-slate-500 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20 ${passwordError ? "border-red-500/50" : ""}`}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) validatePassword(e.target.value);
                    }}
                    placeholder="Create a strong password"
                    required
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => {
                      setFocusedField(null);
                      validatePassword(password);
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-slate-500 hover:text-foreground dark:hover:text-slate-300 transition-colors"
                    onClick={() => setShowPassword((p) => !p)}
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
                {passwordError && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-red-400"
                  >
                    {passwordError}
                  </motion.p>
                )}

                <PasswordStrength
                  password={password}
                  confirmPassword={confirmPassword}
                />
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground dark:text-slate-200">
                  Confirm password
                </Label>
                <div className="relative">
                  <Lock
                    className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${
                      focusedField === "confirm"
                        ? "text-cyan-400"
                        : passwordsMatch
                          ? "text-emerald-400"
                          : passwordsMismatch
                            ? "text-red-400"
                            : "text-muted-foreground dark:text-slate-500"
                    }`}
                  />
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    className={`pl-10 pr-10 h-11 bg-background dark:bg-white/3 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-slate-500 transition-colors ${
                      passwordsMatch
                        ? "border-emerald-500/50 focus-visible:border-emerald-400"
                        : passwordsMismatch
                          ? "border-red-500/50 focus-visible:border-red-400"
                          : "border-border dark:border-white/10 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
                    }`}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    required
                    onFocus={() => setFocusedField("confirm")}
                    onBlur={() => setFocusedField(null)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-slate-500 hover:text-foreground dark:hover:text-slate-300 transition-colors"
                    onClick={() => setShowConfirmPassword((p) => !p)}
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-11 gap-2 bg-linear-to-r from-cyan-500 to-blue-600 text-white border-0 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:brightness-110 transition-all duration-200 disabled:opacity-40 disabled:shadow-none"
                disabled={
                  isLoading || passwordsMismatch || passwordStrength < 3
                }
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Create account
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground dark:text-slate-500">
                By creating an account you agree to our{" "}
                <Link
                  href="/terms"
                  className="text-cyan-400 hover:text-cyan-300 hover:underline underline-offset-4"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="text-cyan-400 hover:text-cyan-300 hover:underline underline-offset-4"
                >
                  Privacy Policy
                </Link>
                .
              </p>

              <p className="text-center text-sm text-muted-foreground dark:text-slate-400 pt-1">
                Have an account?{" "}
                <Link
                  href="/auth/login"
                  className="text-cyan-400 hover:text-cyan-300 font-medium"
                >
                  Sign in
                </Link>
              </p>
            </form>
          </motion.div>
        </div>
      </div>

      {/* ── Left: live product visual (desktop only) ── */}
      <div className="hidden lg:block sticky top-0 h-screen lg:order-1">
        <AuthPanelChrome>
          <RegisterVisual />
        </AuthPanelChrome>
      </div>
    </div>
  );
}
