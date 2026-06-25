"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Zap,
  Shield,
  Activity,
  Cpu,
  CheckCircle2,
  Lock,
  ArrowRight,
  Mail,
} from "lucide-react";

export function AuthBrandMark({ light = false, href = "/" }: { light?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 group w-fit">
      <div className="relative">
        <div className="w-8 h-8 rounded-lg bg-linear-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 group-hover:shadow-cyan-500/50 transition-shadow duration-300">
          <Zap className="h-4 w-4 text-white fill-white" />
        </div>
        <div className="absolute -inset-0.5 rounded-lg bg-linear-to-br from-cyan-400 to-blue-600 opacity-0 group-hover:opacity-40 blur-sm transition-opacity duration-300" />
      </div>
      <span
        className={`text-base font-bold tracking-tight ${light ? "text-white" : "text-foreground"}`}
      >
        Edge
        <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-400">
          Pulse
        </span>
      </span>
    </Link>
  );
}

export function AuthPageBackground({
  variant,
}: {
  variant: "login" | "register" | "forgot-password" | "reset-password" | "accept-invite";
}) {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-[#020617] pointer-events-none">
      {/* Noise grain */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: "200px 200px",
        }}
      />
      {/* Grid — spans the full viewport so lines stay aligned across both columns */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      {/* Ambient glows — positioned relative to the full viewport, not a half */}
      <div
        className={`absolute w-130 h-130 rounded-full blur-[130px] ${
          variant === "login"
            ? "top-[-12%] left-[-6%] bg-cyan-500/15"
            : variant === "register"
              ? "top-[-12%] right-[-6%] bg-violet-500/15"
              : variant === "forgot-password"
                ? "top-[-12%] left-[-6%] bg-amber-500/15"
                : variant === "reset-password"
                  ? "top-[-12%] right-[-6%] bg-teal-500/15"
                  : "top-[-12%] left-[-6%] bg-emerald-500/15"
        }`}
      />
      <div
        className={`absolute w-105 h-105 rounded-full blur-[120px] ${
          variant === "login"
            ? "bottom-[-10%] right-[10%] bg-blue-600/10"
            : variant === "register"
              ? "bottom-[-10%] left-[10%] bg-emerald-500/10"
              : variant === "forgot-password"
                ? "bottom-[-10%] left-[10%] bg-orange-600/10"
                : variant === "reset-password"
                  ? "bottom-[-10%] right-[10%] bg-cyan-600/10"
                  : "bottom-[-10%] right-[10%] bg-teal-600/10"
        }`}
      />
    </div>
  );
}

export function AuthPanelChrome({
  children,
}: {
  variant?: "login" | "register";
  children: React.ReactNode;
}) {
  return (
    <div className="relative h-full w-full flex flex-col p-10">
      {/* Logo */}
      <AuthBrandMark light />

      {/* Content slot */}
      <div className="flex-1 flex flex-col justify-center py-8">
        {children}
      </div>
    </div>
  );
}

const FEED_EVENTS = [
  { time: "00:01", event: "Process injection blocked", device: "srv-prod-01", sev: "critical" },
  { time: "00:04", event: "Lateral movement detected", device: "ws-finance-03", sev: "critical" },
  { time: "00:07", event: "Auth brute-force attempt", device: "gw-primary", sev: "high" },
  { time: "00:11", event: "Outbound traffic spike", device: "dev-laptop-07", sev: "medium" },
];

const SHAP_FEATURES = [
  { label: "CPU spike", pct: 87 },
  { label: "Network anomaly", pct: 71 },
  { label: "Disk I/O pattern", pct: 54 },
];

export function LoginVisual() {
  const [visible, setVisible] = useState(1);

  useEffect(() => {
    const t = setInterval(() => {
      setVisible((v) => (v >= FEED_EVENTS.length ? 1 : v + 1));
    }, 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-7">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>
          <span className="text-[11px] font-mono font-medium text-emerald-300 tracking-wide uppercase">
            Fleet online
          </span>
        </div>
        <h2 className="text-2xl font-display font-bold text-white leading-snug max-w-sm">
          Your fleet is being watched while you&apos;re away.
        </h2>
        <p className="text-sm text-slate-400 mt-2 max-w-sm">
          1,247 devices reporting. Detection never sleeps.
        </p>
      </div>

      {/* Mockup card */}
      <div className="rounded-2xl border border-white/10 bg-[#0a0f1d]/80 backdrop-blur-sm shadow-2xl shadow-black/40 overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5">
            <span className="relative flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
            <span className="text-[11px] font-mono text-slate-300">
              edgepulse — live
            </span>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Live feed */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                Live feed
              </span>
              <Activity className="h-3 w-3 text-cyan-400" />
            </div>
            <AnimatePresence mode="popLayout">
              {FEED_EVENTS.slice(0, visible)
                .slice(-2)
                .map((e) => (
                  <motion.div
                    key={e.event}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/3 border border-white/5"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        e.sev === "critical"
                          ? "bg-red-500"
                          : e.sev === "high"
                            ? "bg-orange-400"
                            : "bg-amber-400"
                      }`}
                    />
                    <span className="text-xs text-slate-200 truncate flex-1">
                      {e.event}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {e.device}
                    </span>
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>

          {/* SHAP bars */}
          <div className="space-y-2 pt-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Feature attribution
            </span>
            {SHAP_FEATURES.map((f) => (
              <div key={f.label} className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400 w-28 shrink-0">
                  {f.label}
                </span>
                <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${f.pct}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full rounded-full bg-linear-to-r from-cyan-400 to-blue-500"
                  />
                </div>
                <span className="text-[11px] font-mono text-slate-400 w-8 text-right">
                  {f.pct}%
                </span>
              </div>
            ))}
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
            <div>
              <div className="text-base font-display font-bold text-white">
                1,247
              </div>
              <div className="text-[10px] text-slate-500">Devices</div>
            </div>
            <div>
              <div className="text-base font-display font-bold text-emerald-400">
                99.9%
              </div>
              <div className="text-[10px] text-slate-500">Uptime</div>
            </div>
            <div>
              <div className="text-base font-display font-bold text-cyan-400">
                312ms
              </div>
              <div className="text-[10px] text-slate-500">Avg response</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ONBOARD_STEPS = [
  {
    step: "01",
    title: "Deploy",
    desc: "2MB agents, live in under 30s",
    icon: Cpu,
    color: "from-cyan-500 to-blue-600",
  },
  {
    step: "02",
    title: "Detect",
    desc: "On-device anomaly detection",
    icon: Shield,
    color: "from-violet-500 to-purple-600",
  },
  {
    step: "03",
    title: "Explain",
    desc: "SHAP-backed, every decision",
    icon: CheckCircle2,
    color: "from-emerald-500 to-teal-600",
  },
];

export function RegisterVisual() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setActive((v) => (v + 1) % ONBOARD_STEPS.length);
    }, 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-7">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-5">
          <ArrowRight className="h-3 w-3 text-cyan-300" />
          <span className="text-[11px] font-mono font-medium text-cyan-300 tracking-wide uppercase">
            Onboarding
          </span>
        </div>
        <h2 className="text-2xl font-display font-bold text-white leading-snug max-w-sm">
          One account. Your whole fleet, protected.
        </h2>
        <p className="text-sm text-slate-400 mt-2 max-w-sm">
          Set up in minutes — no credit card, no cloud lock-in.
        </p>
      </div>

      {/* Steps card */}
      <div className="rounded-2xl border border-white/10 bg-[#0a0f1d]/80 backdrop-blur-sm shadow-2xl shadow-black/40 p-5 space-y-3">
        {ONBOARD_STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === active;
          return (
            <motion.div
              key={s.step}
              animate={{
                opacity: isActive ? 1 : 0.55,
                scale: isActive ? 1 : 0.985,
              }}
              transition={{ duration: 0.4 }}
              className={`flex items-center gap-3.5 p-3 rounded-xl border transition-colors duration-300 ${
                isActive
                  ? "border-white/15 bg-white/4"
                  : "border-white/5 bg-transparent"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-lg bg-linear-to-br ${s.color} flex items-center justify-center shrink-0 shadow-lg ${isActive ? "shadow-cyan-500/20" : "shadow-none"}`}
              >
                <Icon className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500">
                    {s.step}
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {s.title}
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate">{s.desc}</p>
              </div>
              {isActive && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-2 w-2 rounded-full bg-cyan-400 shrink-0"
                />
              )}
            </motion.div>
          );
        })}

        {/* Fleet counter strip */}
        <div className="grid grid-cols-3 gap-2 pt-3 mt-2 border-t border-white/5">
          <div>
            <div className="text-base font-display font-bold text-white">
              30s
            </div>
            <div className="text-[10px] text-slate-500">To go live</div>
          </div>
          <div>
            <div className="text-base font-display font-bold text-white">
              2MB
            </div>
            <div className="text-[10px] text-slate-500">Agent size</div>
          </div>
          <div>
            <div className="text-base font-display font-bold text-white">
              0
            </div>
            <div className="text-[10px] text-slate-500">Cloud round-trips</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SECURITY_FEATURES = [
  { label: "End-to-end encrypted", pct: 100 },
  { label: "Zero-knowledge proof", pct: 100 },
  { label: "SOC 2 compliant", pct: 100 },
];

export function ForgotPasswordVisual() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setVisible((v) => !v), 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-7">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 mb-5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
          </span>
          <span className="text-[11px] font-mono font-medium text-amber-300 tracking-wide uppercase">
            Security first
          </span>
        </div>
        <h2 className="text-2xl font-display font-bold text-white leading-snug max-w-sm">
          We take account recovery seriously.
        </h2>
        <p className="text-sm text-slate-400 mt-2 max-w-sm">
          Time-limited, encrypted reset links — no plain-text passwords ever.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0a0f1d]/80 backdrop-blur-sm shadow-2xl shadow-black/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5">
            <Mail className="h-3 w-3 text-amber-400" />
            <span className="text-[11px] font-mono text-slate-300">
              recovery — active
            </span>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Email sent animation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                Recovery status
              </span>
              <span className="text-[10px] font-mono text-emerald-400">
                {visible ? "Delivered" : "Sending..."}
              </span>
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/3 border border-white/5">
              <motion.div
                animate={{ rotate: visible ? 0 : 360 }}
                transition={{ duration: 2, repeat: visible ? 0 : Infinity, ease: "linear" }}
              >
                <Mail className={`h-5 w-5 ${visible ? "text-emerald-400" : "text-amber-400"}`} />
              </motion.div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-200 truncate">
                  Password reset link
                </p>
                <p className="text-[10px] text-slate-500">
                  Encrypted · Expires in 1 hour
                </p>
              </div>
              {visible && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400 }}
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </motion.div>
              )}
            </div>
          </div>

          {/* Security features */}
          <div className="space-y-2 pt-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Security guarantees
            </span>
            {SECURITY_FEATURES.map((f) => (
              <div key={f.label} className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400 w-34 shrink-0">
                  {f.label}
                </span>
                <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${f.pct}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full rounded-full bg-linear-to-r from-amber-400 to-orange-500"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
            <div>
              <div className="text-base font-display font-bold text-white">
                99.9%
              </div>
              <div className="text-[10px] text-slate-500">Uptime SLA</div>
            </div>
            <div>
              <div className="text-base font-display font-bold text-amber-400">
                &lt;5s
              </div>
              <div className="text-[10px] text-slate-500">Delivery time</div>
            </div>
            <div>
              <div className="text-base font-display font-bold text-white">
                256-bit
              </div>
              <div className="text-[10px] text-slate-500">Encryption</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PASSWORD_STEPS = [
  { step: "01", title: "Generate", desc: "Cryptographically random", icon: Lock },
  { step: "02", title: "Encrypt", desc: "AES-256 before transit", icon: Shield },
  { step: "03", title: "Verify", desc: "Integrity check passed", icon: CheckCircle2 },
];

export function ResetPasswordVisual() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setActive((v) => (v + 1) % PASSWORD_STEPS.length);
    }, 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-7">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 mb-5">
          <Shield className="h-3 w-3 text-teal-300" />
          <span className="text-[11px] font-mono font-medium text-teal-300 tracking-wide uppercase">
            Password security
          </span>
        </div>
        <h2 className="text-2xl font-display font-bold text-white leading-snug max-w-sm">
          Strong passwords are our thing.
        </h2>
        <p className="text-sm text-slate-400 mt-2 max-w-sm">
          Enterprise-grade password policies enforced at the edge.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0a0f1d]/80 backdrop-blur-sm shadow-2xl shadow-black/40 p-5 space-y-3">
        {PASSWORD_STEPS.map((s, i) => {
          const Icon = s.icon as React.ElementType;
          const isActive = i === active;
          return (
            <motion.div
              key={s.step}
              animate={{
                opacity: isActive ? 1 : 0.55,
                scale: isActive ? 1 : 0.985,
              }}
              transition={{ duration: 0.4 }}
              className={`flex items-center gap-3.5 p-3 rounded-xl border transition-colors duration-300 ${
                isActive
                  ? "border-white/15 bg-white/4"
                  : "border-white/5 bg-transparent"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-lg bg-linear-to-br from-teal-500 to-cyan-600 flex items-center justify-center shrink-0 shadow-lg ${isActive ? "shadow-teal-500/20" : "shadow-none"}`}
              >
                <Icon className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500">
                    {s.step}
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {s.title}
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate">{s.desc}</p>
              </div>
              {isActive && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-2 w-2 rounded-full bg-teal-400 shrink-0"
                />
              )}
            </motion.div>
          );
        })}

        <div className="grid grid-cols-2 gap-3 pt-3 mt-2 border-t border-white/5">
          <div>
            <div className="text-base font-display font-bold text-teal-400">
              128-bit
            </div>
            <div className="text-[10px] text-slate-500">Min entropy</div>
          </div>
          <div>
            <div className="text-base font-display font-bold text-white">
              OWASP
            </div>
            <div className="text-[10px] text-slate-500">Compliant</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const TEAM_BENEFITS = [
  { label: "Role-based access", pct: 100 },
  { label: "Audit trail", pct: 100 },
  { label: "SSO ready", pct: 85 },
];

export function AcceptInviteVisual() {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setPulse((v) => !v), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-7">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>
          <span className="text-[11px] font-mono font-medium text-emerald-300 tracking-wide uppercase">
            Team access
          </span>
        </div>
        <h2 className="text-2xl font-display font-bold text-white leading-snug max-w-sm">
          You&apos;ve been invited to join a team.
        </h2>
        <p className="text-sm text-slate-400 mt-2 max-w-sm">
          Collaborate on threat detection, alerts, and reports.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0a0f1d]/80 backdrop-blur-sm shadow-2xl shadow-black/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            <span className="text-[11px] font-mono text-slate-300">
              member — pending
            </span>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Welcome card */}
          <motion.div
            animate={{ scale: pulse ? 1.02 : 1 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-3 px-3 py-3 rounded-lg bg-white/3 border border-white/5"
          >
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-white">EP</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">EdgePulse Org</p>
              <p className="text-[10px] text-slate-500">
                Security Operations Team
              </p>
            </div>
          </motion.div>

          {/* Benefits */}
          <div className="space-y-2 pt-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Your access includes
            </span>
            {TEAM_BENEFITS.map((f) => (
              <div key={f.label} className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400 w-28 shrink-0">
                  {f.label}
                </span>
                <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${f.pct}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full rounded-full bg-linear-to-r from-emerald-400 to-teal-500"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
            <div>
              <div className="text-base font-display font-bold text-white">
                Org
              </div>
              <div className="text-[10px] text-slate-500">Analyst role</div>
            </div>
            <div>
              <div className="text-base font-display font-bold text-emerald-400">
                Instant
              </div>
              <div className="text-[10px] text-slate-500">Activation</div>
            </div>
            <div>
              <div className="text-base font-display font-bold text-white">
                SOC 2
              </div>
              <div className="text-[10px] text-slate-500">Compliant</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}