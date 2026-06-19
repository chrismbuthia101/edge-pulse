"use client";

import React from "react";
import { motion, useInView } from "framer-motion";
import { Quote, Star } from "lucide-react";

const metrics = [
  { val: "10K+", label: "Devices Protected", sub: "across 200+ enterprises" },
  { val: "99.9%", label: "Detection Accuracy", sub: "validated on real-world data" },
  { val: "< 500ms", label: "Mean Response Time", sub: "from detection to block" },
  { val: "0%", label: "Data Leaves Infra", sub: "full edge-native processing" },
];

const testimonials = [
  {
    quote: "EdgePulse fundamentally changed how we approach endpoint security. SHAP explanations let our SOC team justify every alert to stakeholders in seconds — no more black-box decisions.",
    name: "Sarah Chen",
    role: "CISO",
    company: "TechCorp Global",
    initials: "SC",
    color: "from-cyan-500 to-blue-600",
  },
  {
    quote: "We cut mean time to respond from 4 hours to under 30 seconds. The edge-native architecture finally gives us air-gapped OT coverage with zero compliance headaches.",
    name: "Marcus Reid",
    role: "Head of Infrastructure Security",
    company: "Meridian Energy",
    initials: "MR",
    color: "from-violet-500 to-purple-600",
  },
];

export function Trust() {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} id="security" className="relative py-32 bg-[#020617] overflow-hidden">
      {/* subtle horizontal line */}
      <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />
      <div className="absolute bottom-0 inset-x-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />

      {/* background glow */}
      <div className="absolute top-1/2 right-0 w-150 h-150 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #7c3aed, transparent)", filter: "blur(100px)", transform: "translate(40%, -50%)" }} />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }} className="text-center mb-20">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-violet-400 mb-4">
            Trusted by Industry Leaders
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-5">
            Proven at enterprise scale.
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto">
            Thousands of security teams rely on EdgePulse to protect their most critical infrastructure.
          </p>
        </motion.div>

        {/* Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-20">
          {metrics.map((m, i) => (
            <motion.div key={m.label}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group relative rounded-2xl p-6 border border-white/5 bg-white/2 hover:bg-white/4 transition-all duration-300 text-center overflow-hidden">
              {/* Top border gradient */}
              <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="text-3xl font-black text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-400 mb-1">
                {m.val}
              </div>
              <div className="text-sm font-semibold text-white mb-1">{m.label}</div>
              <div className="text-xs text-white/35">{m.sub}</div>
            </motion.div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="grid md:grid-cols-2 gap-6">
          {testimonials.map((t, i) => (
            <motion.div key={t.name}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.4 + i * 0.15 }}
              className="group relative rounded-2xl p-8 border border-white/5 bg-white/2 hover:bg-white/4 transition-all duration-500 overflow-hidden">
              {/* Quote mark */}
              <Quote className="absolute top-6 right-6 h-10 w-10 text-white/5 group-hover:text-white/8 transition-colors duration-300" />

              {/* Stars */}
              <div className="flex gap-1 mb-5">
                {[...Array(5)].map((_, j) => <Star key={j} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />)}
              </div>

              <blockquote className="text-base text-white/65 leading-relaxed mb-7">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              <div className="flex items-center gap-3 pt-5 border-t border-white/5">
                <div className={`w-10 h-10 rounded-full bg-linear-to-br ${t.color} flex items-center justify-center shrink-0`}>
                  <span className="text-xs font-bold text-white">{t.initials}</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{t.name}</div>
                  <div className="text-xs text-white/40">{t.role} · {t.company}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}