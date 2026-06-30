"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff, ShieldCheck, ArrowRight } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  AuthBrandMark,
  AuthPageBackground,
  AuthPanelChrome,
  ResetPasswordVisual,
} from "@/components/auth/auth-visual-panel";
import {
  PasswordStrength,
  getPasswordStrength,
  getPasswordErrors,
} from "@/components/auth/password-strength";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const passwordStrength = getPasswordStrength(password);
  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const passwordErr = getPasswordErrors(password, confirmPassword);
    if (passwordErr) {
      toast.error(passwordErr);
      return;
    }

    setIsLoading(true);

    const result = await useAuthStore.getState().updatePassword(password);

    if (!result.success) {
      toast.error(result.error ?? "Failed to update password");
      setIsLoading(false);
      return;
    }

    await useAuthStore.getState().signOut();

    setSuccess(true);
    toast.success("Password updated successfully!");
    setTimeout(() => {
      router.push("/auth/login");
      router.refresh();
    }, 2500);
  };

  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <AuthPageBackground variant="reset-password" />

      {/* ── Left: visual panel (desktop only) ── */}
      <div className="hidden lg:block sticky top-0 h-screen">
        <AuthPanelChrome>
          <ResetPasswordVisual />
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
              {!success ? (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -24 }}
                  transition={{ duration: 0.45 }}
                >
                  <div className="mb-8">
                    <h1 className="text-3xl font-display font-bold text-foreground dark:text-white mb-2">
                      New password
                    </h1>
                    <p className="text-muted-foreground dark:text-slate-400 text-sm">
                      Choose a strong password to secure your account.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {/* New Password */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-foreground dark:text-slate-200">
                        New Password
                      </Label>
                      <div className="relative">
                        <Lock
                          className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField === "password" ? "text-cyan-400" : "text-muted-foreground dark:text-slate-500"}`}
                        />
                        <Input
                          type={showPassword ? "text" : "password"}
                          className="pl-10 pr-10 h-11 bg-background dark:bg-white/3 border-border dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-slate-500 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter new password"
                          required
                          onFocus={() => setFocusedField("password")}
                          onBlur={() => setFocusedField(null)}
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

                      <PasswordStrength
                        password={password}
                        confirmPassword={confirmPassword}
                      />
                    </div>

                    {/* Confirm Password */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-foreground dark:text-slate-200">
                        Confirm New Password
                      </Label>
                      <div className="relative">
                        <Lock
                          className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${
                            focusedField === "confirm"
                              ? "text-cyan-400"
                              : confirmPassword.length > 0 &&
                                  password === confirmPassword
                                ? "text-emerald-400"
                                : confirmPassword.length > 0 &&
                                    password !== confirmPassword
                                  ? "text-red-400"
                                  : "text-muted-foreground dark:text-slate-500"
                          }`}
                        />
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          className={`pl-10 pr-10 h-11 bg-background dark:bg-white/3 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-slate-500 transition-colors ${
                            confirmPassword.length > 0 &&
                            password === confirmPassword
                              ? "border-emerald-500/50 focus-visible:border-emerald-400"
                              : confirmPassword.length > 0 &&
                                  password !== confirmPassword
                                ? "border-red-500/50 focus-visible:border-red-400"
                                : "border-border dark:border-white/10 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
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
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-slate-500 hover:text-foreground dark:hover:text-slate-300 transition-colors"
                          onClick={() => setShowConfirmPassword((p) => !p)}
                          aria-label={
                            showConfirmPassword
                              ? "Hide password"
                              : "Show password"
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
                        isLoading ||
                        passwordsMismatch ||
                        passwordStrength < 3 ||
                        !confirmPassword
                      }
                    >
                      {isLoading ? (
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
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
                  transition={{
                    duration: 0.45,
                    type: "spring",
                    stiffness: 300,
                  }}
                  className="text-center"
                >
                  <motion.div
                    className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-6"
                    initial={{ scale: 0, rotate: -10 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                      delay: 0.1,
                      type: "spring",
                      stiffness: 400,
                    }}
                  >
                    <ShieldCheck className="w-10 h-10 text-emerald-500" />
                  </motion.div>

                  <motion.h2
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-2xl font-display font-bold text-foreground dark:text-white mb-2"
                  >
                    Password updated!
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-sm text-muted-foreground dark:text-slate-400 mb-8"
                  >
                    Your password has been changed successfully. Redirecting you
                    to login
                  </motion.p>

                  <motion.div className="w-full h-1 bg-border dark:bg-white/10 rounded-full overflow-hidden mb-6">
                    <motion.div
                      className="h-full bg-emerald-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 2.5, ease: "linear" }}
                    />
                  </motion.div>

                  <Button
                    variant="outline"
                    className="w-full h-11 border-border dark:border-white/15 bg-background dark:bg-white/3 text-foreground dark:text-white hover:bg-accent dark:hover:bg-white/[0.07] hover:text-accent-foreground dark:hover:text-white"
                    asChild
                  >
                    <Link href="/dashboard">Go to dashboard now</Link>
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
