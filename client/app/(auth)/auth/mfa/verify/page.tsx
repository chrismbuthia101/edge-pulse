"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Shield, ArrowRight, AlertCircle, Smartphone } from "lucide-react";
import { useAuthStore, resolvePostLoginRoute } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  AuthPanelChrome,
  AuthBrandMark,
} from "@/components/auth/auth-visual-panel";

function MFAVerifyPage() {
  const router = useRouter();
  const mfaRequired = useAuthStore((s) => s.mfaRequired);
  const challengeMFA = useAuthStore((s) => s.challengeMFA);
  const verifyMFA = useAuthStore((s) => s.verifyMFA);

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!mfaRequired) {
      router.replace("/auth/login");
      return;
    }
    document.title = "Two-Factor Authentication - EdgePulse";
  }, [mfaRequired, router]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").split("");
      const newCode = [...code];
      digits.forEach((d, i) => {
        if (index + i < 6) newCode[index + i] = d;
      });
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    const digits = pasted.slice(0, 6).split("");
    const newCode = [...code];
    digits.forEach((d, i) => {
      if (i < 6) newCode[i] = d;
    });
    setCode(newCode);
    inputRefs.current[Math.min(digits.length, 5)]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError("Please enter the full 6-digit code");
      return;
    }

    setIsLoading(true);
    setError(null);

    await challengeMFA();
    const result = await verifyMFA(fullCode);

    if (!result.success) {
      setError(result.error ?? "Invalid code. Please try again.");
      setCode(["", "", "", "", "", ""]);
      setIsLoading(false);
      inputRefs.current[0]?.focus();
      return;
    }

    const {
      profiles,
      activeOrganizationId,
      profileFetchFailed,
    } = useAuthStore.getState();
    const destination = resolvePostLoginRoute(
      profiles,
      activeOrganizationId,
      undefined,
      profileFetchFailed,
    );

    setIsLoading(false);
    toast.success("Verification successful!");
    router.push(destination);
  };

  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="hidden lg:block sticky top-0 h-screen">
        <AuthPanelChrome>
          <div className="flex flex-col items-center justify-center h-full px-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 mb-6">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-display font-bold text-white mb-3">
              Secure Your Account
            </h2>
            <p className="text-white/60 text-sm leading-relaxed max-w-80">
              Two-factor authentication adds an extra layer of security to
              protect your EdgePulse account from unauthorized access.
            </p>
          </div>
        </AuthPanelChrome>
      </div>

      <div className="flex flex-col min-h-screen">
        <div className="flex items-center px-6 sm:px-10 py-5">
          <div className="lg:hidden">
            <AuthBrandMark light />
          </div>
        </div>

        <div className="flex-1 flex flex-col px-6 sm:px-10 pb-10 lg:items-center lg:justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-100 mx-auto"
          >
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
                <Smartphone className="h-6 w-6 text-cyan-400" />
              </div>
              <h1 className="text-3xl font-display font-bold text-foreground dark:text-white mb-2">
                Two-Factor Authentication
              </h1>
              <p className="text-muted-foreground dark:text-slate-400 text-sm">
                Enter the verification code from your authenticator app
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground dark:text-slate-200 text-center block">
                  Verification Code
                </Label>
                <div className="flex justify-center gap-2">
                  {code.map((digit, index) => (
                    <Input
                      key={index}
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      onPaste={index === 0 ? handlePaste : undefined}
                      className="w-12 h-14 text-center text-lg font-mono bg-background dark:bg-white/3 border-border dark:border-white/10 text-foreground dark:text-white focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
                      autoComplete="one-time-code"
                    />
                  ))}
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 rounded-lg px-4 py-3"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </motion.div>
              )}

              <Button
                type="submit"
                className="w-full h-11 gap-2 bg-linear-to-r from-cyan-500 to-blue-600 text-white border-0 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:brightness-110 transition-all duration-200"
                disabled={isLoading || code.join("").length !== 6}
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Verify
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground dark:text-slate-400 mt-6">
              Having trouble? Contact your administrator for help.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default function MFAVerifyPageWrapper() {
  return (
    <Suspense>
      <MFAVerifyPage />
    </Suspense>
  );
}
