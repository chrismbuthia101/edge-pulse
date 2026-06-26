"use client";

import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { Shield, Zap, Brain, ArrowRight, Play, Radar } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { BackgroundLayers } from "@/components/landing/background-layers";

const ANOMALY_EVENTS = [
  {
    time: "00:01",
    event: "Process injection blocked",
    device: "srv-prod-01",
    score: 0.97,
    sev: "critical",
  },
  {
    time: "00:03",
    event: "Lateral movement detected",
    device: "ws-finance-03",
    score: 0.91,
    sev: "critical",
  },
  {
    time: "00:05",
    event: "Outbound data exfiltration",
    device: "dev-laptop-07",
    score: 0.88,
    sev: "high",
  },
  {
    time: "00:08",
    event: "Auth brute-force attempt",
    device: "gw-primary",
    score: 0.79,
    sev: "high",
  },
];

const SHAP_FEATURES = [
  { label: "CPU spike", pct: 87, positive: true },
  { label: "Network anomaly", pct: 71, positive: true },
  { label: "Disk I/O pattern", pct: 54, positive: true },
  { label: "Process tree", pct: 38, positive: false },
];

const TRUST_LOGOS = [
  { name: "Meridian", icon: Radar },
  { name: "TechCorp", icon: Shield },
  { name: "Axiom Global", icon: Zap },
  { name: "Sentinel", icon: Shield },
  { name: "Nexus Sec", icon: Radar },
];

export function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "40%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setVisible((v) => (v < ANOMALY_EVENTS.length ? v + 1 : v)),
      800,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <section
      ref={ref}
      aria-label="Hero"
      className="relative min-h-screen flex items-center overflow-hidden bg-(--landing-bg)"
    >
      <BackgroundLayers grid noise glow={null} />

      {/* Radial glows — extra positioning overrides */}
      <div
        className="absolute bottom-[-20%] right-[-10%] w-700 h-700 rounded-full opacity-15 pointer-events-none"
        style={{
          background: "radial-gradient(circle, #1d4ed8 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute top-[40%] left-[40%] w-400 h-400 rounded-full opacity-10 pointer-events-none"
        style={{
          background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
        aria-hidden="true"
      />

      {/* Animated rings */}
      {!prefersReducedMotion &&
        [0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute top-1/2 left-1/2 rounded-full border border-cyan-500/10 pointer-events-none"
            style={{
              width: `${500 + i * 250}px`,
              height: `${500 + i * 250}px`,
              x: "-50%",
              y: "-50%",
            }}
            animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.1, 0.3] }}
            transition={{
              duration: 4 + i * 1.5,
              repeat: Infinity,
              delay: i * 0.8,
            }}
            aria-hidden="true"
          />
        ))}

      <motion.div
        style={prefersReducedMotion ? {} : { y, opacity }}
        className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-28 pb-16"
      >
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* ── LEFT: Copy ── */}
          <div>
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-(--landing-card) border border-(--landing-border-light) backdrop-blur-sm mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
              </span>
              <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">
                Live Threat Detection Active
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7 }}
              className="text-5xl md:text-6xl lg:text-[4rem] font-black tracking-tight leading-[1.05] text-(--landing-text) mb-6"
            >
              Stop threats
              <br />
              <span className="relative inline-block">
                <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-400 to-violet-400">
                  before they land.
                </span>
                {/* underline glow */}
                <span className="absolute -bottom-1 left-0 right-0 h-px bg-linear-to-r from-cyan-400 via-blue-400 to-violet-400 opacity-50" />
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="text-lg text-(--landing-text-secondary) leading-relaxed mb-10 max-w-lg"
            >
              ML-powered behavioral detection running entirely at the edge. Zero
              cloud round-trips. Full explainability. Sub-500ms response — even
              offline.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="flex flex-wrap gap-4 mb-14"
            >
              <Link
                href="/auth/register"
                className="group relative inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold text-white overflow-hidden cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
              >
                <div className="absolute inset-0 bg-linear-to-r from-cyan-500 to-blue-600" />
                <div className="absolute inset-0 bg-linear-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute inset-0 shadow-lg shadow-cyan-500/30 group-hover:shadow-cyan-500/50 transition-shadow duration-300" />
                <span className="relative">Start Protected</span>
                <ArrowRight className="relative h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>

              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-(--landing-text-secondary) border border-(--landing-border-light) hover:bg-(--landing-card-hover) hover:text-(--landing-text) hover:border-(--landing-border-light) transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Watch Demo
              </Link>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              className="grid grid-cols-3 gap-6"
            >
              {[
                { val: "< 500ms", label: "Detection latency" },
                { val: "99.9%", label: "Accuracy rate" },
                { val: "2MB", label: "Agent footprint" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="border-l border-(--landing-border) pl-4"
                >
                  <div className="text-2xl font-black text-(--landing-text)">
                    {s.val}
                  </div>
                  <div className="text-xs text-(--landing-text-muted) mt-0.5">
                    {s.label}
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* ── RIGHT: Dashboard mockup ── */}
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="relative"
          >
            {/* Glow behind */}
            <div className="absolute inset-4 bg-linear-to-br from-cyan-500/20 to-blue-600/20 rounded-3xl blur-3xl pointer-events-none" />

            {/* Main card */}
            <div className="relative rounded-2xl border border-(--landing-border-light) bg-card dark:bg-[#0a1628]/90 backdrop-blur-xl overflow-hidden shadow-2xl shadow-(--landing-border)">
              {/* Window bar */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-(--landing-border) bg-(--landing-card)">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/70" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                  <div className="w-3 h-3 rounded-full bg-green-500/70" />
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-(--landing-card) border border-(--landing-border-light)">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-xs font-mono text-(--landing-text-muted)">
                    edgepulse — live
                  </span>
                </div>
                <div className="w-16" />
              </div>

              <div className="p-5 space-y-4">
                {/* Critical alert banner */}
                <motion.div
                  animate={{
                    borderColor: [
                      "rgba(239,68,68,0.3)",
                      "rgba(239,68,68,0.6)",
                      "rgba(239,68,68,0.3)",
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30"
                >
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                    <Shield className="h-4 w-4 text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-red-400">
                      CRITICAL — Process Injection Blocked
                    </p>
                    <p className="text-xs text-(--landing-text-muted) truncate">
                      srv-prod-01 · Confidence 0.97 · 0ms response
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-mono text-(--landing-text-muted)">
                    NOW
                  </span>
                </motion.div>

                {/* Anomaly score */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-(--landing-text-secondary) font-medium">
                      Anomaly Score
                    </span>
                    <span className="text-xs font-bold text-red-400 font-mono">
                      0.97
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-(--landing-card) overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: "linear-gradient(90deg, #f59e0b, #ef4444)",
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: "97%" }}
                      transition={{
                        duration: 1.5,
                        delay: 0.8,
                        ease: "easeOut",
                      }}
                    />
                  </div>
                </div>

                {/* SHAP features */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-(--landing-text-muted) uppercase tracking-widest">
                    SHAP Feature Attribution
                  </p>
                  {SHAP_FEATURES.map((f, i) => (
                    <div key={f.label} className="flex items-center gap-3">
                      <span className="text-xs text-(--landing-text-secondary) w-28 shrink-0">
                        {f.label}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-(--landing-card) overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${f.positive ? "bg-red-500" : "bg-cyan-500"}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${f.pct}%` }}
                          transition={{
                            duration: 0.8,
                            delay: 1 + i * 0.12,
                            ease: "easeOut",
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono text-(--landing-text-muted) w-8 text-right">
                        {f.pct}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Live event feed */}
                <div>
                  <p className="text-xs font-semibold text-(--landing-text-muted) uppercase tracking-widest mb-2">
                    Live Feed
                  </p>
                  <div className="space-y-1.5">
                    {ANOMALY_EVENTS.slice(0, visible).map((ev, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="font-mono text-(--landing-text-muted) w-8">
                          {ev.time}
                        </span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${ev.sev === "critical" ? "bg-red-400" : "bg-orange-400"}`}
                        />
                        <span className="text-(--landing-text-secondary) flex-1 truncate">
                          {ev.event}
                        </span>
                        <span className="font-mono text-(--landing-text-muted)">
                          {ev.device}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Bottom stat row */}
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-(--landing-border)">
                  {[
                    { label: "Devices", val: "1,247", color: "text-cyan-400" },
                    {
                      label: "Blocked today",
                      val: "89",
                      color: "text-red-400",
                    },
                    {
                      label: "Avg response",
                      val: "312ms",
                      color: "text-green-400",
                    },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <div
                        className={`text-base font-bold font-mono ${s.color}`}
                      >
                        {s.val}
                      </div>
                      <div className="text-[10px] text-(--landing-text-muted)">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Floating badges */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
              className="hidden lg:block absolute -top-5 -right-5 px-3 py-2 rounded-xl bg-card dark:bg-[#0a1628]/90 border border-(--landing-border-light) backdrop-blur-xl shadow-xl"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <Zap
                    className="h-3.5 w-3.5 text-white fill-white"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <div className="text-xs font-bold text-(--landing-text)">
                    Edge Agent
                  </div>
                  <div className="text-[10px] text-(--landing-text-muted)">
                    2MB · Offline ready
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.25 }}
              className="hidden lg:block absolute -bottom-5 -left-5 px-3 py-2 rounded-xl bg-card dark:bg-[#0a1628]/90 border border-(--landing-border-light) backdrop-blur-xl shadow-xl"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Brain
                    className="h-3.5 w-3.5 text-white"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <div className="text-xs font-bold text-(--landing-text)">
                    SHAP Explained
                  </div>
                  <div className="text-[10px] text-(--landing-text-muted)">
                    Every decision transparent
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Trust logos row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-24 pt-12 border-t border-(--landing-border)"
        >
          <p className="text-center text-xs text-(--landing-text-muted) uppercase tracking-widest mb-8">
            Trusted by security teams at
          </p>
          <div className="flex items-center justify-center gap-8 md:gap-14 flex-wrap">
            {TRUST_LOGOS.map((logo) => {
              const Icon = logo.icon;
              return (
                <div
                  key={logo.name}
                  className="flex items-center gap-2 text-(--landing-text-muted) hover:text-(--landing-text-secondary) transition-colors duration-300"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm font-bold tracking-widest">
                    {logo.name}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
