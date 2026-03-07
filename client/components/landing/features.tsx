"use client";

import React from "react";
import { motion, Variants, useInView } from "framer-motion";
import { Shield, Zap, Brain, Lock, ArrowRight } from "lucide-react";

const features = [
  {
    icon: Shield,
    title: "Real-time Defense",
    description:
      "Advanced ML algorithms detect and neutralize threats in milliseconds before they can propagate across your network.",
    accent: "text-primary",
    bg: "bg-primary/8",
    border: "border-primary/15 hover:border-primary/30",
  },
  {
    icon: Brain,
    title: "Explainable AI",
    description:
      "SHAP-powered insights provide complete transparency for every detection decision — no black boxes, ever.",
    accent: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/8",
    border: "border-violet-500/15 hover:border-violet-500/30",
  },
  {
    icon: Zap,
    title: "Edge Native",
    description:
      "Ultra-lightweight 2MB agents with zero cloud dependency. Full inference runs locally with minimal resource footprint.",
    accent: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/8",
    border: "border-amber-500/15 hover:border-amber-500/30",
  },
  {
    icon: Lock,
    title: "Privacy First",
    description:
      "Your sensitive telemetry data never leaves your infrastructure. Compliance-ready by design for GDPR, HIPAA, and SOC 2.",
    accent: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/8",
    border: "border-emerald-500/15 hover:border-emerald-500/30",
  },
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { y: 24, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.55, ease: "easeOut" },
  },
};

export function Features() {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} id="features" className="py-24 bg-muted/30 border-y border-border">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header with enhanced animation */}
        <motion.div
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
            Platform Features
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4 leading-tight"
          >
            Next-generation security,{" "}
            <span className="text-primary">built for the edge</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-muted-foreground text-base leading-relaxed"
          >
            Cutting-edge technology designed for the modern enterprise threat landscape —
            without the complexity, latency, or privacy tradeoffs of cloud-dependent solutions.
          </motion.p>
        </motion.div>

        {/* Enhanced feature grid with interactive animations */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid md:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              whileHover={{
                y: -8,
                scale: 1.02,
                transition: { duration: 0.2, type: "spring", stiffness: 400 }
              }}
              whileTap={{ scale: 0.98 }}
              className={`group relative bg-card rounded-2xl border ${feature.border} p-6 transition-all duration-300 hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30 overflow-hidden`}
            >
              {/* Animated background gradient on hover */}
              <motion.div
                className={`absolute inset-0 ${feature.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                initial={false}
                animate={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
              />

              {/* Icon with enhanced animation */}
              <motion.div
                className={`relative w-11 h-11 rounded-xl ${feature.bg} border ${feature.border} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}
                whileHover={{ rotate: [0, -5, 5, 0] }}
                transition={{ duration: 0.5 }}
              >
                <feature.icon className={`w-5 h-5 ${feature.accent} group-hover:scale-110 transition-transform duration-300`} />
                {/* Subtle glow effect on hover */}
                <motion.div
                  className={`absolute inset-0 rounded-xl ${feature.accent.replace('text-', 'bg-').replace('600', '500').replace('400', '500')} opacity-0 group-hover:opacity-20 blur-md transition-opacity duration-300`}
                />
              </motion.div>

              {/* Content with staggered animation */}
              <div className="relative">
                <motion.h3
                  className="text-base font-semibold text-foreground mb-2 group-hover:${feature.accent} transition-colors duration-300"
                  whileHover={{ x: 2 }}
                  transition={{ duration: 0.2 }}
                >
                  {feature.title}
                </motion.h3>
                <motion.p
                  className="text-sm text-muted-foreground leading-relaxed mb-4"
                  whileHover={{ y: -1 }}
                  transition={{ duration: 0.2 }}
                >
                  {feature.description}
                </motion.p>

                {/* Enhanced learn more link */}
                <motion.div
                  className={`flex items-center gap-1 text-xs font-medium ${feature.accent} opacity-0 group-hover:opacity-100 transition-all duration-300`}
                  initial={{ x: -10 }}
                  whileHover={{ x: 0 }}
                >
                  <span>Learn more</span>
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2, type: "spring", stiffness: 400 }}
                  >
                    <ArrowRight className="h-3 w-3" />
                  </motion.div>
                </motion.div>
              </div>

              {/* Subtle particle effect on hover */}
              <motion.div
                className="absolute top-2 right-2 w-1 h-1 rounded-full bg-primary opacity-0 group-hover:opacity-60"
                animate={{ scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}