"use client";

import React from "react";
import { motion, useInView } from "framer-motion";
import { Shield, Zap, Brain, Lock, Eye, Activity } from "lucide-react";
import { BackgroundLayers } from "@/components/landing/background-layers";

const features = [
  {
    icon: Shield,
    title: "Real-time Defense",
    description:
      "ML algorithms neutralize threats in milliseconds before they propagate — fully autonomous blocking.",
    color: "from-cyan-500 to-blue-600",
    glow: "rgba(6,182,212,0.15)",
    border: "rgba(6,182,212,0.25)",
  },
  {
    icon: Brain,
    title: "Explainable AI",
    description:
      "SHAP-powered insights reveal exactly why every detection was made. No black boxes, ever.",
    color: "from-violet-500 to-purple-600",
    glow: "rgba(139,92,246,0.15)",
    border: "rgba(139,92,246,0.25)",
  },
  {
    icon: Zap,
    title: "Edge Native",
    description:
      "2MB agents with zero cloud dependency. Full inference at the device level. Works air-gapped.",
    color: "from-amber-400 to-orange-500",
    glow: "rgba(251,191,36,0.15)",
    border: "rgba(251,191,36,0.25)",
  },
  {
    icon: Lock,
    title: "Privacy First",
    description:
      "Sensitive telemetry never leaves your infrastructure. GDPR, HIPAA & SOC 2 ready by design.",
    color: "from-emerald-500 to-teal-600",
    glow: "rgba(16,185,129,0.15)",
    border: "rgba(16,185,129,0.25)",
  },
  {
    icon: Eye,
    title: "Full Visibility",
    description:
      "Unified dashboard with live anomaly feed, device health, and forensic export — all in one pane.",
    color: "from-rose-500 to-pink-600",
    glow: "rgba(244,63,94,0.15)",
    border: "rgba(244,63,94,0.25)",
  },
  {
    icon: Activity,
    title: "Offline Resilience",
    description:
      "Queue-and-sync architecture keeps detecting threats even when connectivity drops.",
    color: "from-sky-500 to-indigo-600",
    glow: "rgba(14,165,233,0.15)",
    border: "rgba(14,165,233,0.25)",
  },
];

export function Features() {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      ref={ref}
      id="features"
      className="relative py-32 bg-(--landing-bg) overflow-hidden scroll-mt-24"
      aria-labelledby="features-heading"
    >
      <BackgroundLayers grid noise={false} glow="cyan" />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-400 mb-4">
            Platform Capabilities
          </span>
          <h2
            id="features-heading"
            className="text-4xl md:text-5xl font-black text-(--landing-text) mb-5 leading-tight"
          >
            Security designed for
            <span className="block text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-400">
              the modern edge.
            </span>
          </h2>
          <p className="text-lg text-(--landing-text-secondary) max-w-2xl mx-auto">
            Enterprise-grade protection without cloud dependency, latency
            penalties, or privacy tradeoffs.
          </p>
        </motion.div>

        {/* Feature grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.1 }}
            >
              <div className="group relative h-full rounded-2xl p-7 border border-(--landing-border) bg-(--landing-card) hover:bg-(--landing-card-hover) hover:scale-[1.02] transition-all duration-500 overflow-hidden cursor-pointer">
                {/* Hover glow */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                  style={{
                    background: `radial-gradient(circle at 30% 30%, ${f.glow}, transparent 70%)`,
                  }}
                  aria-hidden="true"
                />

                {/* Border glow on hover */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ boxShadow: `inset 0 0 0 1px ${f.border}` }}
                  aria-hidden="true"
                />

                {/* Icon */}
                <div
                  className={`relative w-12 h-12 rounded-xl bg-linear-to-br ${f.color} flex items-center justify-center mb-6 shadow-lg`}
                  style={{ boxShadow: `0 0 20px ${f.glow}` }}
                >
                  <f.icon className="w-5 h-5 text-white" aria-hidden="true" />
                </div>

                <h3 className="text-base font-bold text-(--landing-text) mb-3">
                  {f.title}
                </h3>
                <p className="text-sm text-(--landing-text-secondary) leading-relaxed">
                  {f.description}
                </p>

                {/* Corner accent */}
                <div
                  className={`absolute bottom-0 right-0 w-24 h-24 rounded-tl-3xl opacity-0 group-hover:opacity-10 transition-opacity duration-500 bg-linear-to-br ${f.color}`}
                  aria-hidden="true"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
