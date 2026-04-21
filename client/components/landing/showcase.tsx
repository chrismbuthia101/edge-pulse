"use client";

import React from "react";
import { motion, useInView } from "framer-motion";
import { Monitor, Shield, CheckCircle2, ArrowRight, Cpu, Activity } from "lucide-react";
import Link from "next/link";

const steps = [
  {
    step: "01",
    title: "Deploy 2MB Agents",
    desc: "Install EdgePulse agents via MDM, script, or silent installer. Works on Linux, macOS, Windows. Agent goes live in under 30 seconds.",
    icon: Cpu,
    color: "from-cyan-500 to-blue-600",
    glow: "rgba(6,182,212,0.2)",
  },
  {
    step: "02",
    title: "Detect at the Edge",
    desc: "Isolation Forest + Autoencoder models run locally on-device. No cloud round-trip. Detection happens in < 500ms, even air-gapped.",
    icon: Activity,
    color: "from-violet-500 to-purple-600",
    glow: "rgba(139,92,246,0.2)",
  },
  {
    step: "03",
    title: "Explain & Respond",
    desc: "SHAP values surface the top features driving each anomaly. Auto-block critical threats. Full forensic export for investigations.",
    icon: Shield,
    color: "from-emerald-500 to-teal-600",
    glow: "rgba(16,185,129,0.2)",
  },
];

const dashboardFeatures = [
  "Live anomaly score feed with SHAP breakdown",
  "Device fleet management & isolation controls",
  "Hash-chain tamper-evident audit log",
  "Offline sync queue — zero data loss",
  "Role-based access: Admin, Analyst",
  "Explainable AI comparison across methods",
];

export function Showcase() {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} id="how-it-works" className="relative py-32 bg-[#030918] overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-white/8 to-transparent" />

      {/* Grid */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)", backgroundSize: "72px 72px" }} />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }} className="text-center mb-24">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-emerald-400 mb-4">
            How It Works
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-5">
            From install to protected
            <span className="block text-transparent bg-clip-text bg-linear-to-r from-emerald-400 to-teal-400">
              in 30 seconds.
            </span>
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            Zero configuration. No cloud dependencies. Just install the agent and EdgePulse starts protecting.
          </p>
        </motion.div>

        {/* 3-step flow */}
        <div className="grid lg:grid-cols-3 gap-6 mb-32">
          {steps.map((s, i) => (
            <motion.div key={s.step}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              className="group relative">
              {/* Connector line */}
              {i < 2 && (
                <div className="hidden lg:block absolute top-8 left-[calc(100%+12px)] w-6 border-t border-dashed border-white/15 z-20" />
              )}

              <div className="relative rounded-2xl p-8 border border-white/5 bg-white/2 hover:bg-white/4 transition-all duration-500 h-full overflow-hidden">
                {/* Glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                  style={{ background: `radial-gradient(circle at 30% 20%, ${s.glow}, transparent 65%)` }} />

                {/* Step number */}
                <div className="text-5xl font-black text-white/4 mb-5 font-mono">{s.step}</div>

                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl bg-linear-to-br ${s.color} flex items-center justify-center mb-5 shadow-lg`}
                  style={{ boxShadow: `0 0 20px ${s.glow}` }}>
                  <s.icon className="w-5 h-5 text-white" />
                </div>

                <h3 className="text-lg font-bold text-white mb-3">{s.title}</h3>
                <p className="text-sm text-white/45 leading-relaxed">{s.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Platform showcase */}
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: copy */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.4 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-6">
              <Monitor className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-xs font-semibold text-cyan-400">Command Dashboard</span>
            </div>

            <h3 className="text-3xl md:text-4xl font-black text-white mb-5 leading-tight">
              Everything you need in
              <span className="block text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-400">
                one command center.
              </span>
            </h3>
            <p className="text-base text-white/45 leading-relaxed mb-8">
              A unified operations center that surfaces the alerts that matter — with full context, SHAP explainability, and one-click device isolation.
            </p>

            <ul className="space-y-3 mb-10">
              {dashboardFeatures.map((feat) => (
                <li key={feat} className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-white/60">{feat}</span>
                </li>
              ))}
            </ul>

            <Link href="/auth/register"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white border border-white/10 hover:bg-white/5 hover:border-white/20 transition-all duration-200">
              Explore the Platform
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>

          {/* Right: mini dashboard preview */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="relative">
            <div className="absolute inset-4 bg-linear-to-br from-cyan-500/15 to-blue-600/15 rounded-3xl blur-3xl pointer-events-none" />

            <div className="relative rounded-2xl border border-white/8 bg-[#0a1628]/80 backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/50">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                </div>
                <div className="flex-1 mx-4 h-5 rounded bg-white/4 flex items-center px-2">
                  <span className="text-[10px] font-mono text-white/25">edgepulse / dashboard</span>
                </div>
              </div>

              {/* Dashboard grid preview */}
              <div className="p-5 space-y-4">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Active Alerts", val: "12", c: "text-red-400" },
                    { label: "Devices Online", val: "1,247", c: "text-cyan-400" },
                    { label: "Resolved Today", val: "89", c: "text-emerald-400" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl p-3 bg-white/3 border border-white/4 text-center">
                      <div className={`text-lg font-bold font-mono ${s.c}`}>{s.val}</div>
                      <div className="text-[10px] text-white/30 mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Chart placeholder */}
                <div className="rounded-xl p-4 bg-white/3 border border-white/4">
                  <div className="text-xs text-white/40 mb-3">24h Anomaly Activity</div>
                  <div className="flex items-end gap-1 h-16">
                    {[12, 8, 15, 6, 22, 18, 9, 31, 14, 7, 19, 25, 11, 8, 13, 27, 16, 10, 21, 17, 6, 14, 29, 11].map((v, i) => (
                      <div key={i} className="flex-1 rounded-t-sm"
                        style={{
                          height: `${(v / 31) * 100}%`,
                          background: v > 20 ? "rgb(239,68,68)" : v > 14 ? "rgb(249,115,22)" : "rgb(6,182,212)",
                          opacity: 0.7
                        }} />
                    ))}
                  </div>
                </div>

                {/* Alert list */}
                <div className="space-y-2">
                  {[
                    { title: "Process injection detected", dev: "srv-prod-01", sev: "critical" },
                    { title: "Unusual outbound traffic", dev: "dev-laptop-07", sev: "high" },
                    { title: "Auth brute-force blocked", dev: "ws-finance-03", sev: "medium" },
                  ].map((a) => (
                    <div key={a.title} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/2 border border-white/4">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.sev === "critical" ? "bg-red-400" : a.sev === "high" ? "bg-orange-400" : "bg-amber-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white/70 truncate">{a.title}</div>
                        <div className="text-[10px] text-white/30">{a.dev}</div>
                      </div>
                      <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.sev === "critical" ? "bg-red-500/15 text-red-400" : a.sev === "high" ? "bg-orange-500/15 text-orange-400" : "bg-amber-500/15 text-amber-400"}`}>
                        {a.sev}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* CTA block */}
        <motion.div initial={{ opacity: 0, y: 40 }} animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.6 }}
          className="relative mt-28 rounded-3xl overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 bg-linear-to-br from-cyan-500/15 via-blue-600/10 to-violet-600/15" />
          <div className="absolute inset-0"
            style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
          <div className="absolute inset-0 border border-white/8 rounded-3xl" />

          {/* Top line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px bg-linear-to-r from-transparent via-cyan-400/60 to-transparent" />

          <div className="relative z-10 text-center py-20 px-8">
            <h3 className="text-4xl md:text-5xl font-black text-white mb-5">
              Ready to secure your edge?
            </h3>
            <p className="text-lg text-white/45 max-w-xl mx-auto mb-10">
              Join thousands of organizations trusting EdgePulse for intelligent, explainable, privacy-first edge security.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/auth/register"
                className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-bold text-white overflow-hidden">
                <div className="absolute inset-0 bg-linear-to-r from-cyan-500 to-blue-600" />
                <div className="absolute inset-0 bg-linear-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative">Start Free Trial</span>
                <ArrowRight className="relative h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/auth/login"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-semibold text-white/70 border border-white/10 hover:bg-white/5 hover:text-white hover:border-white/20 transition-all duration-200">
                Schedule Demo
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}