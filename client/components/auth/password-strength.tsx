"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle } from "lucide-react";

export const passwordRequirements = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (p: string) => p.length >= 8,
  },
  {
    id: "uppercase",
    label: "One uppercase letter",
    test: (p: string) => /[A-Z]/.test(p),
  },
  {
    id: "lowercase",
    label: "One lowercase letter",
    test: (p: string) => /[a-z]/.test(p),
  },
  { id: "number", label: "One number", test: (p: string) => /\d/.test(p) },
  {
    id: "special",
    label: "One special character",
    test: (p: string) => /[!@#$%^&*]/.test(p),
  },
];

const strengthLabels = ["", "Weak", "Fair", "Good", "Strong", "Excellent"];
const strengthColors = [
  "",
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-cyan-400",
];
const strengthTextColors = [
  "",
  "text-red-400",
  "text-orange-400",
  "text-amber-400",
  "text-emerald-400",
  "text-cyan-400",
];

export function getPasswordStrength(password: string): number {
  return passwordRequirements.filter((r) => r.test(password)).length;
}

export function getPasswordErrors(
  password: string,
  confirmPassword: string,
): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }

  const strength = getPasswordStrength(password);
  if (strength < 3) {
    return "Password is too weak. Please meet at least 3 requirements.";
  }

  if (password !== confirmPassword) {
    return "Passwords do not match";
  }

  return null;
}

interface PasswordStrengthProps {
  password: string;
  confirmPassword: string;
}

export function PasswordStrength({
  password,
  confirmPassword,
}: PasswordStrengthProps) {
  const metRequirements = passwordRequirements.filter((r) => r.test(password));
  const passwordStrength = metRequirements.length;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <AnimatePresence>
      {password.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-2 pt-1 overflow-hidden"
        >
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className="flex-1 h-1 rounded-full overflow-hidden bg-white/10"
              >
                <motion.div
                  className={`h-full rounded-full transition-all duration-300 ${s <= passwordStrength ? strengthColors[passwordStrength] : ""}`}
                  initial={{ width: 0 }}
                  animate={{
                    width: s <= passwordStrength ? "100%" : "0%",
                  }}
                  transition={{ duration: 0.25, delay: s * 0.04 }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-medium ${strengthTextColors[passwordStrength]}`}
            >
              {strengthLabels[passwordStrength]}
            </span>
            <span className="text-xs text-slate-500">
              {passwordStrength}/5 requirements
            </span>
          </div>

          <div className="grid grid-cols-1 gap-1 pt-1">
            {passwordRequirements.map((req) => {
              const met = req.test(password);
              return (
                <div key={req.id} className="flex items-center gap-2">
                  {met ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                  )}
                  <span
                    className={`text-xs transition-colors ${met ? "text-slate-200" : "text-slate-500"}`}
                  >
                    {req.label}
                  </span>
                </div>
              );
            })}
          </div>

          {confirmPassword.length > 0 && (
            <div className="pt-1">
              {passwordsMatch && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-xs text-emerald-400 flex items-center gap-1"
                >
                  <CheckCircle2 className="h-3 w-3" /> Passwords match
                </motion.p>
              )}
              {passwordsMismatch && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-xs text-red-400"
                >
                  Passwords do not match
                </motion.p>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
