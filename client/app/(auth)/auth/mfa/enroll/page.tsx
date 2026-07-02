"use client";

import { useState, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Shield,
  ArrowRight,
  AlertCircle,
  Smartphone,
  CheckCircle2,
  Copy,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  AuthPanelChrome,
  AuthBrandMark,
} from "@/components/auth/auth-visual-panel";
import { QRCodeSVG } from "qrcode.react";

type Step = "intro" | "scan" | "verify" | "complete";

function MFAEnrollPage() {
  const router = useRouter();
  const enrollMFA = useAuthStore((s) => s.enrollMFA);
  const confirmMFAEnrollment = useAuthStore((s) => s.confirmMFAEnrollment);
  const syncMFAStatusToProfile = useAuthStore((s) => s.syncMFAStatusToProfile);

  const [step, setStep] = useState<Step>("intro");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = "Set Up Two-Factor Authentication - EdgePulse";
  }, []);

  const handleStart = async () => {
    setIsLoading(true);
    setError(null);

    const result = await enrollMFA();

    if (!result.success) {
      setError(result.error ?? "Failed to start enrollment");
      setIsLoading(false);
      return;
    }

    setQrCode(result.data.uri);
    setSecret(result.data.secret);
    setIsLoading(false);
    setStep("scan");
  };

  const handleCopySecret = async () => {
    if (secret) {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    if (value && index < 5) {
      const next = document.getElementById(`mfa-code-${index + 1}`);
      next?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      const prev = document.getElementById(`mfa-code-${index - 1}`);
      prev?.focus();
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError("Please enter the full 6-digit code");
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await confirmMFAEnrollment(fullCode);

    if (!result.success) {
      setError(result.error ?? "Invalid code. Please try again.");
      setCode(["", "", "", "", "", ""]);
      setIsLoading(false);
      return;
    }

    await syncMFAStatusToProfile(true);
    setIsLoading(false);
    setStep("complete");
  };

  const handleFinish = () => {
    toast.success("Two-factor authentication enabled!");
    router.push("/dashboard");
  };

  const codeComplete = code.join("").length === 6;

  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="hidden lg:block sticky top-0 h-screen">
        <AuthPanelChrome>
          <div className="flex flex-col items-center justify-center h-full px-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 mb-6">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-display font-bold text-white mb-3">
              Two-Factor Authentication
            </h2>
            <p className="text-white/60 text-sm leading-relaxed max-w-80">
              Protect your account with an additional layer of security using
              your preferred authenticator app.
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
            <AnimatePresence mode="wait">
              {step === "intro" && (
                <motion.div
                  key="intro"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="text-center"
                >
                  <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
                    <Shield className="h-6 w-6 text-cyan-400" />
                  </div>
                  <h1 className="text-3xl font-display font-bold text-foreground dark:text-white mb-2">
                    Set Up Two-Factor Auth
                  </h1>
                  <p className="text-muted-foreground dark:text-slate-400 text-sm mb-8">
                    As an organization admin, you&apos;re required to enable
                    two-factor authentication for your account.
                  </p>

                  <div className="space-y-4 text-left mb-8">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border">
                      <Smartphone className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Use an authenticator app
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Google Authenticator, Authy, Microsoft
                          Authenticator, or any TOTP-compatible app
                        </p>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 rounded-lg px-4 py-3 mb-4">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <Button
                    onClick={handleStart}
                    className="w-full h-11 gap-2 bg-linear-to-r from-cyan-500 to-blue-600 text-white border-0 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:brightness-110 transition-all duration-200"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        Get Started
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </motion.div>
              )}

              {step === "scan" && (
                <motion.div
                  key="scan"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <div className="text-center mb-6">
                    <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
                      <Smartphone className="h-6 w-6 text-cyan-400" />
                    </div>
                    <h1 className="text-2xl font-display font-bold text-foreground dark:text-white mb-2">
                      Scan QR Code
                    </h1>
                    <p className="text-muted-foreground dark:text-slate-400 text-sm">
                      Scan this code with your authenticator app
                    </p>
                  </div>

                  <div className="flex justify-center mb-6">
                    <div className="p-4 bg-white rounded-2xl shadow-lg">
                      {qrCode && (
                        <QRCodeSVG
                          value={qrCode}
                          size={200}
                          level="M"
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 mb-6">
                    <code className="text-xs font-mono bg-muted px-3 py-1.5 rounded-md text-muted-foreground">
                      {secret}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors"
                      title="Copy secret key"
                    >
                      {copied ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>

                  <div className="text-center mb-6">
                    <p className="text-xs text-muted-foreground">
                      Can&apos;t scan? Enter the secret key manually into your
                      authenticator app.
                    </p>
                  </div>

                  <Button
                    onClick={() => setStep("verify")}
                    className="w-full h-11 gap-2 bg-linear-to-r from-cyan-500 to-blue-600 text-white border-0 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:brightness-110 transition-all duration-200"
                  >
                    I&apos;ve scanned the code
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              )}

              {step === "verify" && (
                <motion.div
                  key="verify"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <div className="text-center mb-6">
                    <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
                      <CheckCircle2 className="h-6 w-6 text-cyan-400" />
                    </div>
                    <h1 className="text-2xl font-display font-bold text-foreground dark:text-white mb-2">
                      Verify Setup
                    </h1>
                    <p className="text-muted-foreground dark:text-slate-400 text-sm">
                      Enter the 6-digit code from your authenticator app
                    </p>
                  </div>

                  <div className="flex justify-center gap-2 mb-6">
                    {code.map((digit, index) => (
                      <Input
                        key={index}
                        id={`mfa-code-${index}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) =>
                          handleCodeChange(index, e.target.value)
                        }
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        className="w-12 h-14 text-center text-lg font-mono bg-background dark:bg-white/3 border-border dark:border-white/10 text-foreground dark:text-white focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
                      />
                    ))}
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 rounded-lg px-4 py-3 mb-4">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <Button
                    onClick={handleVerify}
                    className="w-full h-11 gap-2 bg-linear-to-r from-cyan-500 to-blue-600 text-white border-0 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:brightness-110 transition-all duration-200"
                    disabled={isLoading || !codeComplete}
                  >
                    {isLoading ? (
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        Verify & Enable
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </motion.div>
              )}

              {step === "complete" && (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="text-center"
                >
                  <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                  </div>
                  <h1 className="text-2xl font-display font-bold text-foreground dark:text-white mb-2">
                    All Set!
                  </h1>
                  <p className="text-muted-foreground dark:text-slate-400 text-sm mb-8">
                    Two-factor authentication is now enabled for your account.
                    You&apos;ll need to enter a verification code from your
                    authenticator app each time you sign in.
                  </p>

                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-8 text-left">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">
                      Important
                    </p>
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                      If you lose access to your authenticator app, you may be
                      locked out of your account. Contact your organization
                      administrator for recovery options.
                    </p>
                  </div>

                  <Button
                    onClick={handleFinish}
                    className="w-full h-11 gap-2 bg-linear-to-r from-cyan-500 to-blue-600 text-white border-0 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:brightness-110 transition-all duration-200"
                  >
                    Go to Dashboard
                    <ArrowRight className="h-4 w-4" />
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

export default function MFAEnrollPageWrapper() {
  return (
    <Suspense>
      <MFAEnrollPage />
    </Suspense>
  );
}
