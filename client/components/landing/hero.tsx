"use client";

import Link from "next/link";
import { motion, Variants, easeOut, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { ArrowRight, Shield, Zap, Brain, Activity, AlertTriangle, Cpu, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemo, useState, useEffect } from "react";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { y: 24, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.6, ease: easeOut },
  },
};

const stats = [
  { label: "< 500ms Detection", icon: Zap },
  { label: "100% Edge Native", icon: Shield },
  { label: "SHAP XAI Engine", icon: Brain },
];

const threatEvents = [
  { time: "00:01", event: "Port scan detected", device: "srv-prod-01", severity: "high" },
  { time: "00:03", event: "Unusual outbound traffic", device: "dev-laptop-07", severity: "critical" },
  { time: "00:05", event: "Auth brute-force attempt", device: "ws-finance-03", severity: "high" },
  { time: "00:08", event: "Process injection blocked", device: "srv-prod-02", severity: "critical" },
];

export function Hero() {
  const shouldReduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const parallaxY = useTransform(scrollY, [0, 1000], [0, -150]);
  const parallaxScale = useTransform(scrollY, [0, 1000], [1, 0.8]);

  const particles = useMemo(
    () =>
      [...Array(30)].map((_, i) => {
        const seed = i * 1234;
        return {
          id: i,
          left: ((seed * 9301 + 49297) % 233280) / 233280 * 100,
          top: ((seed * 233280 + 9301) % 233280) / 233280 * 100,
          xMovement: ((seed * 49297 + 233280) % 60) - 30,
          yMovement: ((seed * 1234 + 49297) % 40) - 20,
          duration: 8 + ((seed * 9301) % 10),
          delay: ((seed * 49297) % 8),
          size: 1 + ((seed * 1111) % 4),
          type: (i % 3 === 0 ? "glow" : i % 3 === 1 ? "float" : "pulse") as "glow" | "float" | "pulse",
        };
      }),
    []
  );

  // Reduce particles on mobile for performance
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const displayParticles = isMobile ? particles.slice(0, 8) : particles;

  interface Particle {
    id: number;
    left: number;
    top: number;
    xMovement: number;
    yMovement: number;
    duration: number;
    delay: number;
    size: number;
    type: "glow" | "float" | "pulse";
  };

  // Disable animations when reduced motion is preferred
  const getAnimationVariants = (p: Particle) => {
    if (shouldReduceMotion) return {};
    return {
      glow: {
        y: [0, -100, 0],
        x: [0, p.xMovement, 0],
        opacity: [0, 0.8, 0],
        scale: [1, 1.5, 1],
      },
      float: {
        y: [0, -60, 0],
        x: [0, p.xMovement * 0.5, 0],
        opacity: [0, 0.6, 0],
        rotate: [0, 180, 360],
      },
      pulse: {
        y: [0, -40, 0],
        x: [0, p.xMovement * 0.3, 0],
        opacity: [0, 0.4, 0],
        scale: [1, 0.5, 1],
      },
    };
  };

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-20">
      {/* Background — theme-aware subtle texture */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Soft radial glow — primary color, works in both modes */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px]" />

        {/* Grid pattern */}
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(var(--grid-light))" strokeWidth="0.8" opacity="0.3" />
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(var(--grid-dark))" strokeWidth="0.4" opacity="0.2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>

        {/* Enhanced floating particles with different types */}
        {displayParticles.map((p: Particle) => {
          const variants = getAnimationVariants(p);
          const currentVariant = shouldReduceMotion ? {} : variants[p.type];

          return (
            <motion.div
              key={p.id}
              className={`absolute rounded-full ${p.type === "glow"
                ? "bg-primary/60 blur-sm"
                : p.type === "float"
                  ? "bg-primary/40"
                  : "bg-primary/30"
                }`}
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                width: p.size,
                height: p.size,
              }}
              animate={shouldReduceMotion ? {} : currentVariant}
              transition={shouldReduceMotion ? {} : {
                duration: p.duration,
                repeat: Infinity,
                delay: p.delay,
                ease: "easeInOut",
                times: [0, 0.5, 1]
              }}
            />
          );
        })}
      </div>

      {/* Main content — two columns with parallax */}
      <motion.div
        style={{
          y: shouldReduceMotion ? 0 : parallaxY,
          scale: shouldReduceMotion ? 1 : parallaxScale
        }}
        className="relative z-10 w-full max-w-7xl mx-auto px-6 py-16"
      >
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* ── Left column: copy ── */}
          <motion.div variants={shouldReduceMotion ? {} : containerVariants} initial="hidden" animate="visible">
            {/* Pill badge */}
            <motion.div variants={shouldReduceMotion ? {} : itemVariants} className="mb-6">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/25 bg-primary/8 text-primary text-xs font-semibold tracking-wide uppercase">
                <span className={`w-1.5 h-1.5 rounded-full bg-primary ${shouldReduceMotion ? '' : 'animate-pulse'}`} />
                ML-Powered Edge Security
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={shouldReduceMotion ? {} : itemVariants}
              className="text-4xl md:text-5xl lg:text-[3.4rem] font-display font-bold tracking-tight leading-[1.1] mb-6 text-foreground"
            >
              Intelligent Edge{" "}
              <span className="relative">
                <span className="bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  Security.
                </span>
              </span>
              <br />
              <span className="text-foreground/70">Zero Trust.</span>{" "}
              <span className="text-foreground/50 text-3xl md:text-4xl lg:text-[2.6rem]">Zero Latency.</span>
            </motion.h1>

            {/* Subheading */}
            <motion.p
              variants={shouldReduceMotion ? {} : itemVariants}
              className="text-base md:text-lg text-muted-foreground leading-relaxed mb-8 max-w-lg"
            >
              Revolutionary AI-powered threat detection that operates entirely at the edge.
              Real-time responses, complete data privacy, and transparent explainable AI —
              built for enterprise scale.
            </motion.p>

            {/* CTA buttons */}
            <motion.div variants={shouldReduceMotion ? {} : itemVariants} whileHover={shouldReduceMotion ? {} : { x: 4 }} transition={{ duration: 0.2, type: "spring", stiffness: 400 }} className="flex flex-wrap gap-3 mb-10">
              <Button size="lg" className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow" asChild>
                <Link href="/auth/register">
                  <Shield className="h-4 w-4" />
                  Start Protected
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="gap-2" asChild>
                <Link href="/auth/login">
                  <Activity className="h-4 w-4" />
                  Live Demo
                </Link>
              </Button>
            </motion.div>

            {/* Stats row */}
            <motion.div variants={shouldReduceMotion ? {} : itemVariants} className="flex flex-wrap gap-6">
              {stats.map((stat) => (
                <div key={stat.label} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <stat.icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">{stat.label}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* ── Right column: dashboard mockup ── */}
          <motion.div
            initial={{ opacity: 0, x: 40, y: 10 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: easeOut }}
            className="relative"
          >
            {/* Glow behind card */}
            <div className="absolute inset-0 bg-primary/10 rounded-3xl blur-3xl scale-95 -z-10" />

            {/* Main dashboard card */}
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/40 overflow-hidden">

              {/* Window chrome */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-background rounded-md border border-border">
                  <Shield className="h-3 w-3 text-primary" />
                  <span className="text-xs font-mono text-muted-foreground">edgepulse.local / dashboard</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-muted-foreground">Live</span>
                </div>
              </div>

              {/* Dashboard content */}
              <div className="p-4 bg-background/50">

                {/* Top stat row */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Devices", value: "1,247", delta: "+3", color: "text-primary" },
                    { label: "Threats Blocked", value: "89", delta: "today", color: "text-destructive" },
                    { label: "Avg Response", value: "312ms", delta: "↓18%", color: "text-green-600 dark:text-green-400" },
                  ].map((s) => (
                    <div key={s.label} className="bg-card rounded-xl border border-border p-3">
                      <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                      <p className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-muted-foreground/70">{s.delta}</p>
                    </div>
                  ))}
                </div>

                {/* Critical threat banner */}
                <motion.div
                  className="flex items-center gap-3 p-3 mb-4 rounded-xl bg-destructive/8 border border-destructive/20"
                  animate={{ opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <div className="w-8 h-8 rounded-lg bg-destructive/15 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-destructive">CRITICAL — Process Injection Detected</p>
                    <p className="text-xs text-muted-foreground truncate">dev-laptop-07 · Confidence 0.97 · Blocked automatically</p>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground shrink-0">0ms</span>
                </motion.div>

                {/* Anomaly score bar */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium text-foreground">Anomaly Score</span>
                    <span className="text-xs font-mono font-bold text-destructive">0.97</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-linear-to-r from-yellow-500 via-orange-500 to-destructive rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: "97%" }}
                      transition={{ duration: 1.2, delay: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* SHAP contribution bars */}
                <div className="mb-4">
                  <p className="text-xs font-semibold text-foreground mb-2">SHAP Feature Contributions</p>
                  <div className="space-y-2">
                    {[
                      { label: "CPU Spike", pct: 34, color: "bg-destructive" },
                      { label: "Network Anomaly", pct: 28, color: "bg-orange-500" },
                      { label: "Disk I/O", pct: 19, color: "bg-yellow-500" },
                      { label: "Memory Usage", pct: 11, color: "bg-primary" },
                    ].map((f, i) => (
                      <div key={f.label} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-28 shrink-0">{f.label}</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full ${f.color} rounded-full`}
                            initial={{ width: 0 }}
                            animate={{ width: `${f.pct}%` }}
                            transition={{ duration: 0.8, delay: 1 + i * 0.1, ease: "easeOut" }}
                          />
                        </div>
                        <span className="text-xs font-mono text-muted-foreground w-8 text-right">{f.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live event feed */}
                <div>
                  <p className="text-xs font-semibold text-foreground mb-2">Live Event Feed</p>
                  <div className="space-y-1.5">
                    {threatEvents.map((ev, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.2 + i * 0.15 }}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="font-mono text-muted-foreground/60 w-10 shrink-0">{ev.time}</span>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ev.severity === "critical" ? "bg-destructive" : "bg-orange-500"}`} />
                        <span className="text-muted-foreground flex-1 truncate">{ev.event}</span>
                        <span className="font-mono text-muted-foreground/50 truncate">{ev.device}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Enhanced floating accent cards with improved animations */}
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 1, duration: 0.5, type: "spring", stiffness: 300 }}
              whileHover={{ y: -8, scale: 1.05, rotate: 2 }}
              className="absolute -top-4 -right-4 bg-card border border-border rounded-xl px-3 py-2 shadow-lg hover-lift"
            >
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                >
                  <Cpu className="h-3.5 w-3.5 text-primary" />
                </motion.div>
                <span className="text-xs font-semibold text-foreground">Edge Agent</span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">2.1MB · Offline Ready</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 1.2, duration: 0.5, type: "spring", stiffness: 300 }}
              whileHover={{ y: -8, scale: 1.05, rotate: -2 }}
              className="absolute -bottom-4 -left-4 bg-card border border-border rounded-xl px-3 py-2 shadow-lg hover-lift"
            >
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Wifi className="h-3.5 w-3.5 text-primary" />
                </motion.div>
                <span className="text-xs font-semibold text-foreground">Zero Cloud Dependency</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">All inference runs locally</p>
            </motion.div>
          </motion.div>

        </div>
      </motion.div>
    </section>
  );
}