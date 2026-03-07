"use client";

import React from "react";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import { ShieldCheck, Users, Star, TrendingUp, Quote } from "lucide-react";

const trustMetrics = [
  {
    icon: Users,
    value: "10,000+",
    label: "Devices Protected",
    sub: "across 200+ enterprises",
    accent: "text-primary",
    bg: "bg-primary/8",
    border: "border-primary/15",
  },
  {
    icon: ShieldCheck,
    value: "99.9%",
    label: "Detection Accuracy",
    sub: "validated on real-world data",
    accent: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/8",
    border: "border-emerald-500/15",
  },
  {
    icon: TrendingUp,
    value: "< 500ms",
    label: "Mean Response Time",
    sub: "from detection to block",
    accent: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/8",
    border: "border-amber-500/15",
  },
  {
    icon: Star,
    value: "4.9 / 5",
    label: "Customer Rating",
    sub: "based on 800+ reviews",
    accent: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/8",
    border: "border-violet-500/15",
  },
];

const testimonials = [
  {
    quote:
      "EdgePulse fundamentally changed how we approach endpoint security. The SHAP explanations mean our SOC team can justify every alert to stakeholders within seconds — no more black-box decisions.",
    author: "Sarah Chen",
    role: "CISO",
    company: "TechCorp Global",
    initials: "SC",
  },
  {
    quote:
      "We cut our mean time to respond from 4 hours to under 30 seconds. The edge-native architecture means we finally have air-gapped coverage for our OT network without any compliance headaches.",
    author: "Marcus Reid",
    role: "Head of Infrastructure Security",
    company: "Meridian Energy",
    initials: "MR",
  },
];

export function Trust() {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });

  const parallaxY = useTransform(scrollYProgress, [0, 1], [50, -50]);
  const scaleProgress = useTransform(scrollYProgress, [0, 0.5, 1], [0.8, 1, 0.8]);

  return (
    <section ref={ref} id="security" className="py-24 bg-background relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        {/* Enhanced section header with parallax */}
        <motion.div
          style={{ y: parallaxY }}
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, type: "spring", stiffness: 300 }}
          className="max-w-2xl mb-16"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="inline-block text-xs font-semibold uppercase tracking-widest text-primary mb-3"
          >
            Trusted by Industry Leaders
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4 leading-tight"
          >
            Proven at enterprise scale
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-muted-foreground text-base leading-relaxed"
          >
            Thousands of security teams rely on EdgePulse to protect their most critical infrastructure —
            from cloud workloads to air-gapped OT environments.
          </motion.p>
        </motion.div>

        {/* Enhanced metrics grid with parallax and staggered animations */}
        <motion.div
          style={{ scale: scaleProgress }}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16"
        >
          {trustMetrics.map((metric, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
              transition={{
                delay: index * 0.1,
                duration: 0.5,
                type: "spring",
                stiffness: 300
              }}
              whileHover={{
                y: -8,
                scale: 1.05,
                transition: { duration: 0.2, type: "spring", stiffness: 400 }
              }}
              whileTap={{ scale: 0.98 }}
              className={`bg-card border ${metric.border} rounded-2xl p-5 transition-all duration-300 hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30 relative overflow-hidden group`}
            >
              {/* Animated background on hover */}
              <motion.div
                className={`absolute inset-0 ${metric.bg} opacity-0 group-hover:opacity-50 transition-opacity duration-500`}
              />

              {/* Icon with enhanced animation */}
              <motion.div
                className={`relative w-10 h-10 rounded-xl ${metric.bg} border ${metric.border} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                whileHover={{ rotate: [0, 360] }}
                transition={{ duration: 1, ease: "easeInOut" }}
              >
                <metric.icon className={`w-5 h-5 ${metric.accent} group-hover:scale-110 transition-transform duration-300`} />
                {/* Glow effect */}
                <motion.div
                  className={`absolute inset-0 rounded-xl ${metric.accent.replace('text-', 'bg-').replace('600', '500').replace('400', '500')} opacity-0 group-hover:opacity-20 blur-md transition-opacity duration-300`}
                />
              </motion.div>

              {/* Animated value */}
              <motion.p
                className={`text-2xl font-bold font-display ${metric.accent} mb-0.5 relative`}
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ delay: 0.5 + index * 0.1, duration: 0.4 }}
              >
                {metric.value}
                {/* Subtle underline animation */}
                <motion.div
                  className={`absolute bottom-0 left-0 h-0.5 ${metric.accent.replace('text-', 'bg-').replace('600', '500').replace('400', '500')} rounded-full`}
                  initial={{ width: 0 }}
                  animate={isInView ? { width: "100%" } : {}}
                  transition={{ delay: 0.8 + index * 0.1, duration: 0.6 }}
                />
              </motion.p>
              <motion.p
                className="text-sm font-semibold text-foreground mb-0.5"
                initial={{ opacity: 0, x: -10 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.6 + index * 0.1, duration: 0.4 }}
              >
                {metric.label}
              </motion.p>
              <motion.p
                className="text-xs text-muted-foreground"
                initial={{ opacity: 0, x: -10 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.7 + index * 0.1, duration: 0.4 }}
              >
                {metric.sub}
              </motion.p>
            </motion.div>
          ))}
        </motion.div>

        {/* Enhanced testimonials with parallax and interactive effects */}
        <motion.div
          style={{ y: useTransform(scrollYProgress, [0, 1], [30, -30]) }}
          className="grid md:grid-cols-2 gap-5"
        >
          {testimonials.map((t, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
              transition={{
                delay: index * 0.15,
                duration: 0.55,
                type: "spring",
                stiffness: 300
              }}
              whileHover={{
                y: -6,
                scale: 1.02,
                transition: { duration: 0.2, type: "spring", stiffness: 400 }
              }}
              className="bg-card border border-border rounded-2xl p-6 hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30 transition-all duration-300 relative overflow-hidden group"
            >
              {/* Animated quote icon */}
              <motion.div
                className="absolute top-4 right-4 opacity-10"
                animate={{
                  rotate: [0, 5, -5, 0],
                  scale: [1, 1.1, 1]
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  delay: index * 0.5
                }}
              >
                <Quote className="h-12 w-12 text-primary" />
              </motion.div>

              <Quote className="h-6 w-6 text-primary/40 mb-4 group-hover:text-primary/60 transition-colors duration-300" />

              <motion.blockquote
                className="text-sm text-foreground leading-relaxed mb-5 relative z-10"
                whileHover={{ x: 2 }}
                transition={{ duration: 0.2 }}
              >
                &ldquo;{t.quote}&rdquo;
              </motion.blockquote>

              <motion.div
                className="flex items-center gap-3 pt-4 border-t border-border"
                initial={{ opacity: 0, y: 10 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.3 + index * 0.15, duration: 0.4 }}
              >
                <motion.div
                  className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300"
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                >
                  <span className="text-xs font-bold text-primary">{t.initials}</span>
                </motion.div>
                <div>
                  <motion.p
                    className="text-sm font-semibold text-foreground"
                    whileHover={{ x: 2 }}
                    transition={{ duration: 0.2 }}
                  >
                    {t.author}
                  </motion.p>
                  <p className="text-xs text-muted-foreground">
                    {t.role} · {t.company}
                  </p>
                </div>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}