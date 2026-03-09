"use client";

import { useState, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, Clock, ArrowRight, Fingerprint } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/ui/logo";
import { toast } from "sonner";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

const securityQuotes = [
  { text: "Security is not a product, but a process.", author: "Bruce Schneier" },
  { text: "The only truly secure system is one that is powered off.", author: "Gene Spafford" },
  { text: "Trust, but verify.", author: "Ronald Reagan" },
  { text: "Privacy is not an option — it's a prerequisite.", author: "EdgePulse" },
];

const trustBadges = [
  { icon: Lock, label: "TLS Encrypted" },
  { icon: Clock, label: "Session Secured" },
  { icon: Clock, label: "Auto-logout" },
  { icon: Fingerprint, label: "Zero-trust" },
];

export function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentQuote, setCurrentQuote] = useState(0);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentQuote((prev) => (prev + 1) % securityQuotes.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const form = new FormData(e.currentTarget);
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error(error.message);
      setIsLoading(false);
      return;
    }

    const next = searchParams.get("next") ?? "/dashboard";
    toast.success("Login successful!");
    router.push(next);
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/dashboard` },
    });

    if (error) {
      toast.error(error.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Left decorative panel ── */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-muted/20 border-r border-border">
        {/* Grid pattern */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <pattern id="login-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--border))" strokeWidth="0.6" opacity="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#login-grid)" />
        </svg>

        {/* Ambient glow */}
        <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-56 h-56 bg-primary/6 rounded-full blur-[80px] pointer-events-none" />

        {/* Logo */}
        <div className="absolute top-8 left-8 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Logo className="h-5 w-5 text-primary" />
          </div>
          <span className="text-xl font-display font-bold text-foreground">
            Edge<span className="text-primary">Pulse</span>
          </span>
        </div>

        {/* Center visual — login image */}
        <div className="absolute top-24 left-12 right-12 bottom-24 flex items-center justify-center">
          <Image
            src="/images/login-img.png"
            alt="Login illustration"
            className="w-full h-full object-cover rounded-2xl"
            width={500}
            height={500}
          />
        </div>

        {/* Quote rotator */}
        <div className="absolute bottom-12 left-8 right-8">
          <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl p-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentQuote}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.45 }}
              >
                <p className="text-sm text-foreground leading-relaxed mb-2">
                  &ldquo;{securityQuotes[currentQuote].text}&rdquo;
                </p>
                <p className="text-xs text-primary font-medium">
                  — {securityQuotes[currentQuote].author}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Quote dots */}
            <div className="flex gap-1.5 mt-4">
              {securityQuotes.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all duration-500 ${i === currentQuote ? "w-5 bg-primary" : "w-1.5 bg-border"
                    }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
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


        </div>

        {/* Form area */}
        <div className="flex-1 flex flex-col p-8 pt-4 lg:items-center lg:justify-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="w-full max-w-[400px] mx-auto"
          >
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-display font-bold text-foreground mb-1.5">
                Welcome back
              </h1>
              <p className="text-muted-foreground text-sm">
                Sign in to your EdgePulse account
              </p>
            </div>

            {/* Google OAuth */}
            <Button
              variant="outline"
              type="button"
              className="w-full h-10 mb-6 gap-2.5"
              onClick={handleGoogleLogin}
              disabled={isLoading}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </Button>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-xs text-muted-foreground uppercase tracking-wider">
                  or sign in with email
                </span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
                <div className="relative">
                  <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField === "email" ? "text-primary" : "text-muted-foreground"}`} />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    className="pl-10 h-10"
                    required
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <Link href="/forgot-password" className="text-xs text-primary hover:underline underline-offset-4">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${focusedField === "password" ? "text-primary" : "text-muted-foreground"}`} />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    className="pl-10 pr-10 h-10"
                    required
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center gap-2">
                <Checkbox id="remember" />
                <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground cursor-pointer">
                  Keep me signed in for 30 days
                </Label>
              </div>


              {/* Submit and Register */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="submit"
                  className="flex-1 h-10 gap-2 text-sm sm:text-base transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg hover:shadow-primary/20"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <motion.div
                      className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                  ) : (
                    <motion.div
                      className="flex items-center gap-2"
                      whileHover={{ x: 2 }}
                      transition={{ duration: 0.2 }}
                    >
                      <span className="hidden sm:inline">Sign In</span>
                      <span className="sm:hidden">Sign</span>
                      <motion.div
                        whileHover={{ scale: 1.1, rotate: 15 }}
                        transition={{ duration: 0.15 }}
                      >
                        <ArrowRight className="h-4 w-4 shrink-0" />
                      </motion.div>
                    </motion.div>
                  )}
                </Button>

                {/* No account + register always side by side */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">No account?</span>

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs sm:text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:border-primary/50 hover:bg-primary/5 hover:shadow-md"
                    asChild
                  >
                    <Link href="/register">
                      <motion.span
                        className="flex items-center gap-3"
                        whileHover={{ x: 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        <span className="hidden sm:inline">Register →</span>
                        <span className="sm:hidden">Create one →</span>
                      </motion.span>
                    </Link>
                  </Button>
                </div>
              </div>
            </form>

          </motion.div>
        </div>

        {/* Mobile image section */}
        <div className="lg:hidden flex flex-col items-center justify-center p-8 pt-4 flex-1">
          <div className="relative flex items-center justify-center w-full max-w-[300px] mb-8">
            <Image
              src="/images/login-img.png"
              alt="Login illustration"
              className="w-full h-auto object-cover rounded-2xl"
              width={400}
              height={150}
            />
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-auto">
            {trustBadges.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="h-3 w-3 text-primary/70" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div >
  );
}

export default function LoginPageWrapper() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}