"use client";

import Link from "next/link";
import { motion, Variants, easeOut, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Play, Shield, Zap, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.6, ease: easeOut, type: "spring", stiffness: 100 },
  },
};

export function Hero() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 1000], [0, 150]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  const nodes = [...Array(12)].map((_, i) => ({
    cx: 10 + (i % 4) * 25,
    cy: 15 + Math.floor(i / 4) * 35,
    key: i,
  }));

  // Generate deterministic particles to avoid Math.random in render
  const particles = useMemo(() =>
    [...Array(30)].map((_, i) => {
      const seed = i * 1234; // Simple seed based on index
      const left = ((seed * 9301 + 49297) % 233280) / 233280 * 100;
      const top = ((seed * 233280 + 9301) % 233280) / 233280 * 100;
      const xMovement = ((seed * 49297 + 233280) % 40) - 20;
      const duration = 8 + ((seed * 9301) % 8);
      const delay = ((seed * 49297) % 4);

      return {
        id: i,
        left,
        top,
        xMovement,
        duration,
        delay,
      };
    }),
    []
  );

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Animated Background */}
      <motion.div
        style={{ y, opacity }}
        className="absolute inset-0"
      >
        {/* Enhanced Mesh Gradient Background */}
        <div className="absolute inset-0 bg-linear-to-br from-slate-950 via-blue-950/30 to-slate-950">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-0 -left-4 w-96 h-96 bg-linear-to-r from-blue-600 to-cyan-600 rounded-full mix-blend-screen filter blur-3xl animate-blob" />
            <div className="absolute top-0 -right-4 w-96 h-96 bg-linear-to-r from-indigo-600 to-purple-600 rounded-full mix-blend-screen filter blur-3xl animate-blob animation-delay-2000" />
            <div className="absolute -bottom-8 left-20 w-96 h-96 bg-linear-to-r from-emerald-600 to-teal-600 rounded-full mix-blend-screen filter blur-3xl animate-blob animation-delay-4000" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-linear-to-r from-slate-600 to-blue-700 rounded-full mix-blend-screen filter blur-3xl animate-blob animation-delay-6000" />
          </div>
        </div>

        {/* Enhanced Grid Pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Enhanced Floating Particles */}
        <div className="absolute inset-0">
          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              className="absolute w-2 h-2 bg-linear-to-r from-blue-400 to-cyan-400 rounded-full shadow-lg shadow-blue-400/50"
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
              }}
              animate={{
                y: [0, -120, 0],
                x: [0, particle.xMovement, 0],
                opacity: [0, 0.8, 0],
                scale: [1, 1.5, 1],
              }}
              transition={{
                duration: particle.duration,
                repeat: Infinity,
                delay: particle.delay,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>

        {/* Enhanced Animated Nodes */}
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {nodes.map((node) => (
            <motion.g key={node.key}>
              <motion.circle
                cx={`${node.cx}%`}
                cy={`${node.cy}%`}
                r="3"
                fill="url(#nodeGradient)"
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: [0, 2, 1],
                  opacity: [0, 1, 0.6],
                }}
                transition={{
                  duration: 2.5,
                  delay: node.key * 0.2,
                  repeat: Infinity,
                  repeatType: "reverse",
                }}
                whileHover={{
                  scale: 3,
                  opacity: 1,
                  filter: "drop-shadow(0 0 12px rgba(59, 130, 246, 0.8))",
                  transition: { duration: 0.3, ease: easeOut },
                }}
              />
              <motion.circle
                cx={`${node.cx}%`}
                cy={`${node.cy}%`}
                r="8"
                fill="none"
                stroke="rgba(59, 130, 246, 0.3)"
                strokeWidth="0.5"
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: [0, 3, 2],
                  opacity: [0, 0.5, 0],
                }}
                transition={{
                  duration: 2.5,
                  delay: node.key * 0.2,
                  repeat: Infinity,
                  repeatType: "reverse",
                }}
              />
            </motion.g>
          ))}
          <defs>
            <radialGradient id="nodeGradient">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#06b6d4" />
            </radialGradient>
          </defs>
        </svg>
      </motion.div>

      {/* Content */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 text-center max-w-5xl mx-auto px-6"
      >
        <motion.h1
          variants={itemVariants}
          className="text-5xl md:text-7xl lg:text-8xl font-display font-bold tracking-tight mb-8"
        >
          <span className="bg-linear-to-r from-white via-blue-100 to-cyan-400 bg-clip-text text-transparent drop-shadow-2xl">
            Intelligent Edge Security.
          </span>
          <br />
          <span className="bg-linear-to-r from-blue-400 via-cyan-500 to-indigo-600 bg-clip-text text-transparent drop-shadow-2xl animate-pulse">
            Zero Trust. Zero Latency.
          </span>
        </motion.h1>

        <motion.p
          variants={itemVariants}
          className="text-xl md:text-2xl text-blue-100/90 mb-12 max-w-4xl mx-auto leading-relaxed font-light"
        >
          Revolutionary          <span className="font-semibold text-transparent bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text">AI-powered threat detection</span> that operates at the edge.
          <span className="text-emerald-300 font-medium">Real-time responses.</span>
          <span className="text-indigo-300 font-medium">Complete privacy.</span>
          <span className="text-slate-300 font-medium">Transparent AI.</span>
        </motion.p>

        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-6 justify-center mb-16"
        >
          <Button size="lg" className="text-lg px-10 py-8 bg-linear-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 border-0 shadow-2xl shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 group">
            <Link href="/register" className="flex items-center">
              <Shield className="mr-3 h-6 w-6 group-hover:rotate-12 transition-transform duration-300" />
              Start Protected
              <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
            </Link>
          </Button>

          <Button variant="outline" size="lg" className="text-lg px-10 py-8 border-blue-500/50 text-blue-300 hover:bg-blue-500/10 hover:border-blue-400 hover:text-blue-200 shadow-xl shadow-blue-500/10 transition-all duration-300 group">
            <Link href="/login" className="flex items-center">
              <Play className="mr-3 h-6 w-6 group-hover:scale-110 transition-transform duration-300" />
              Live Demo
            </Link>
          </Button>
        </motion.div>

        {/* Enhanced Stats */}
        <motion.div variants={itemVariants} className="flex flex-wrap justify-center gap-8 text-sm">
          {[
            { label: "< 500ms Detection", icon: Zap, color: "from-amber-400 to-orange-500" },
            { label: "100% Edge Native", icon: Shield, color: "from-blue-400 to-cyan-500" },
            { label: "SHAP XAI Engine", icon: Brain, color: "from-indigo-400 to-purple-500" }
          ].map((stat, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.08, y: -4 }}
              whileTap={{ scale: 0.98 }}
              className="bg-linear-to-r from-white/10 to-white/5 backdrop-blur-xl border border-white/20 px-8 py-4 rounded-2xl shadow-2xl hover:shadow-3xl hover:shadow-blue-500/20 transition-all duration-300 group"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 bg-linear-to-r ${stat.color} rounded-xl shadow-lg`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-white group-hover:text-blue-200 transition-colors duration-300">
                  {stat.label}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Enhanced Hero Mockup */}
        <motion.div
          variants={itemVariants}
          className="mt-20 relative"
          animate={{ y: [0, -15, 0] }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: easeOut,
            type: "spring",
            stiffness: 40,
            damping: 8
          }}
        >
          <div className="bg-linear-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-2xl border border-blue-500/30 rounded-2xl shadow-3xl p-8 max-w-3xl mx-auto ring-1 ring-blue-400/20 hover:ring-blue-400/40 transition-all duration-500 group">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <motion.div
                  className="w-4 h-4 bg-red-500 rounded-full shadow-lg shadow-red-500/50"
                  animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="font-mono text-sm font-bold text-red-400">CRITICAL THREAT DETECTED</span>
              </div>
              <span className="text-blue-400 text-sm font-mono bg-blue-500/10 px-3 py-1 rounded-lg">dev-laptop-01</span>
            </div>

            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-blue-300">Anomaly Confidence</span>
                <span className="font-mono text-2xl text-red-400 font-bold">0.97</span>
              </div>
              <div className="w-full bg-slate-700/50 rounded-full h-3 overflow-hidden">
                <motion.div
                  className="bg-linear-to-r from-amber-500 to-orange-500 h-3 rounded-full shadow-lg shadow-amber-500/50"
                  style={{ width: "97%" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 1.5, delay: 0.8, type: "spring", stiffness: 100 }}
                />
              </div>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg">
                  <div className="text-red-400 font-semibold mb-1">CPU Spike</div>
                  <div className="text-red-300">34% contribution</div>
                </div>
                <div className="bg-orange-500/10 border border-orange-500/30 p-3 rounded-lg">
                  <div className="text-orange-400 font-semibold mb-1">Network Anomaly</div>
                  <div className="text-orange-300">28% contribution</div>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg">
                  <div className="text-yellow-400 font-semibold mb-1">Disk I/O</div>
                  <div className="text-yellow-300">19% contribution</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}