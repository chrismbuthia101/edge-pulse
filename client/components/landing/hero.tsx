"use client";

import Link from "next/link";
import { motion, Variants, easeOut } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

// Correctly typed variants
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
    transition: { duration: 0.6, ease: easeOut }, // fixed type
  },
};

export function Hero() {
  const nodes = [...Array(8)].map((_, i) => ({
    cx: 20 + (i % 4) * 30,
    cy: 20 + Math.floor(i / 4) * 40,
    key: i,
  }));

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-linear-to-br from-background via-background to-muted/20">
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path
                d="M 60 0 L 0 0 0 60"
                fill="none"
                stroke="hsl(var(--border))"
                strokeWidth="0.5"
                opacity="0.3"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {nodes.map((node) => (
            <motion.circle
              key={node.key}
              cx={`${node.cx}%`}
              cy={`${node.cy}%`}
              r="2"
              fill="hsl(var(--primary))"
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 1.5, 1],
                opacity: [0, 0.8, 0.3],
              }}
              transition={{
                duration: 2,
                delay: node.key * 0.3,
                repeat: Infinity,
                repeatType: "reverse",
              }}
              whileHover={{
                scale: 2.5,
                opacity: 1,
                filter: "drop-shadow(0 0 6px hsl(var(--primary)))",
                transition: { duration: 0.3, ease: easeOut },
              }}
            />
          ))}
        </svg>
      </div>

      {/* Content */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 text-center max-w-5xl mx-auto px-6"
      >
        <motion.h1
          variants={itemVariants}
          className="text-4xl md:text-6xl lg:text-7xl font-display font-bold tracking-tight mb-6"
        >
          Detect Threats at the Edge.
          <br />
          <span className="text-primary">Before They Reach the Core.</span>
        </motion.h1>

        <motion.p
          variants={itemVariants}
          className="text-lg md:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto"
        >
          ML-powered behavioral anomaly detection for enterprise devices. Real-time. 
          Offline-capable. Explainable by design.
        </motion.p>

        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
        >
          <Button size="lg" className="text-lg px-8 py-6">
            <Link href="/auth/register" className="flex items-center">
              Start Monitoring
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>

          <Button variant="outline" size="lg" className="text-lg px-8 py-6">
            <Link href="/auth/login" className="flex items-center">
              <Play className="mr-2 h-5 w-5" />
              View Dashboard Demo
            </Link>
          </Button>
        </motion.div>

        {/* Stats */}
        <motion.div variants={itemVariants} className="flex flex-wrap justify-center gap-8 text-sm">
          {["< 2s Detection", "100% Offline-Capable", "SHAP-Powered XAI"].map((stat, i) => (
            <div key={i} className="bg-muted/50 px-4 py-2 rounded-full border border-border/50">
              {stat}
            </div>
          ))}
        </motion.div>

        {/* Hero Mockup */}
        <motion.div
          variants={itemVariants}
          className="mt-16 relative"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: easeOut }}
        >
          <div className="bg-card border border-border rounded-lg shadow-2xl p-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-alert-critical rounded-full animate-pulse" />
                <span className="font-mono text-sm">CRITICAL ALERT</span>
              </div>
              <span className="text-muted-foreground text-sm">dev-laptop-01</span>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm">Anomaly Score</span>
                <span className="font-mono text-lg text-alert-critical">0.94</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-alert-critical h-2 rounded-full" style={{ width: "94%" }} />
              </div>
              <div className="text-xs text-muted-foreground">
                Top contributors: cpu_percent (34%), network_bytes_sent (28%), disk_io_write_bytes (19%)
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}