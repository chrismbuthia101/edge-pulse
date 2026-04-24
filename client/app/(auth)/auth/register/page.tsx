"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Eye, EyeOff, CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { toast } from "sonner";
import Image from "next/image";

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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const dummy = '\x00'.repeat(b.length);
    let result = 0;
    for (let i = 0; i < b.length; i++) {
      result |= dummy.charCodeAt(i) ^ b.charCodeAt(i);
    }
    void result;
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export default function RegisterPage() {
  const supabase = createClient();
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

  const metRequirements = passwordRequirements.filter((r) => r.test(password));
  const passwordStrength = metRequirements.length;
  const passwordsMatch = confirmPassword.length > 0 && timingSafeEqual(password, confirmPassword);
  const passwordsMismatch = confirmPassword.length > 0 && !timingSafeEqual(password, confirmPassword);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Clear previous errors
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

    if (!timingSafeEqual(password, confirmPassword)) {
      setPasswordError("Passwords do not match");
      return;
    }

    if (passwordStrength < 3) {
      setPasswordError("Password is too weak. Please meet at least 3 requirements.");
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    setIsLoading(false);

    if (error) {
      const errorMsg = error.message.toLowerCase();
      const statusCode = (error as { status?: number; statusCode?: number }).status || (error as { status?: number; statusCode?: number }).statusCode;

      if (statusCode === 429 || errorMsg.includes("rate limit") || errorMsg.includes("over_email_send_rate_limit")) {
        toast.error("Too many attempts. Please try again in 15 minutes.", {
          duration: 5000,
        });
        return;
      }

      if (errorMsg.includes("user already registered") || errorMsg.includes("already exists")) {
        setEmailError("This email is already registered. Please log in instead.");
        return;
      }

      if (errorMsg.includes("email") && !errorMsg.includes("already")) {
        setEmailError(error.message);
      } else if (errorMsg.includes("password")) {
        setPasswordError(error.message);
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success("Account created successfully! Redirecting to login page...");
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
      setPasswordError("Password is too weak. Please meet at least 3 requirements.");
    } else {
      setPasswordError(null);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Grid pattern */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <pattern id="reg-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-light))" strokeWidth="0.8" opacity="0.3" />
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-dark))" strokeWidth="0.4" opacity="0.2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#reg-grid)" />
      </svg>

      {/* Ambient glow */}
      <div className="absolute top-1/3 right-1/3 w-64 h-64 bg-primary/20 rounded-full blur-[90px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-56 h-56 bg-violet-500/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative z-10 min-h-screen flex">
        {/* Left decorative panel */}
        <div className="hidden lg:flex lg:w-[45%] relative">

          {/* Logo */}
          <div className="absolute top-8 left-8 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Logo className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xl font-display font-bold text-foreground">
              Edge<span className="text-primary">Pulse</span>
            </span>
          </div>

          {/* Center visual — register image */}
          <div className="absolute top-24 left-12 right-12 bottom-24 flex items-center justify-center">
            <Image
              src="/images/reg-img.png"
              alt="Register illustration"
              className="w-full h-full object-cover rounded-2xl"
              width={500}
              height={500}
              priority
            />
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex-1 flex flex-col">
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
              <span className="text-sm text-muted-foreground hidden sm:block">Have an account?</span>
              <Button variant="outline" size="sm" asChild>
                <Link href="/auth/login">Sign In →</Link>
              </Button>
            </div>
          </div>

          <div className="flex-1 flex flex-col p-8 pt-4 lg:items-center lg:justify-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="w-full max-w-[420px]"
            >
              <div className="mb-8">
                <h1 className="text-3xl font-display font-bold text-foreground mb-1.5">
                  Create account
                </h1>
                <p className="text-muted-foreground text-sm">
                  Join EdgePulse — secure your infrastructure from day one
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Full name */}
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full Name</Label>
                  <div className="relative">
                    <User className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField === "name" ? "text-primary" : nameError ? "text-destructive" : "text-muted-foreground"}`} />
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="Jane Smith"
                      className={`pl-10 h-10 ${nameError ? "border-destructive focus-visible:border-destructive" : ""}`}
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
                      className="text-xs text-destructive"
                    >
                      {nameError}
                    </motion.p>
                  )}
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField === "email" ? "text-primary" : emailError ? "text-destructive" : "text-muted-foreground"}`} />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@company.com"
                      className={`pl-10 h-10 ${emailError ? "border-destructive focus-visible:border-destructive" : ""}`}
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
                      className="text-xs text-destructive"
                    >
                      {emailError}
                    </motion.p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <div className="relative">
                    <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField === "password" ? "text-primary" : passwordError ? "text-destructive" : "text-muted-foreground"}`} />
                    <Input
                      type={showPassword ? "text" : "password"}
                      className={`pl-10 pr-10 h-10 ${passwordError ? "border-destructive focus-visible:border-destructive" : ""}`}
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowPassword((p) => !p)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordError && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-xs text-destructive"
                    >
                      {passwordError}
                    </motion.p>
                  )}

                  {/* Strength bar */}
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
                                className={`h-full rounded-full transition-all duration-300 ${s <= passwordStrength ? strengthColors[passwordStrength] : ""}`}
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
                          <span className="text-xs text-muted-foreground">{passwordStrength}/5 requirements</span>
                        </div>

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

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <Label>Confirm Password</Label>
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
                      placeholder="Repeat your password"
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

                {/* Submit - disabled when strength < 3 or mismatch */}
                <Button
                  type="submit"
                  className="w-full h-10 gap-2"
                  disabled={isLoading || passwordsMismatch || passwordStrength < 3}
                >
                  {isLoading ? (
                    <motion.div
                      className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                  ) : (
                    <>
                      Create Account
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  By creating an account you agree to our{" "}
                  <Link href="/terms" className="text-primary hover:underline underline-offset-4">
                    Terms of Service
                  </Link>
                  {" "}and{" "}
                  <Link href="/privacy" className="text-primary hover:underline underline-offset-4">
                    Privacy Policy
                  </Link>.
                </p>
              </form>
            </motion.div>
          </div>

        </div>
      </div>
    </div>
  );
}