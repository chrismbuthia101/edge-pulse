"use client";

import { motion } from "framer-motion";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <pattern id="onboarding-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-light))" strokeWidth="0.8" opacity="0.3" />
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-dark))" strokeWidth="0.4" opacity="0.2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#onboarding-grid)" />
      </svg>
      <div className="absolute top-1/3 right-1/3 w-64 h-64 bg-primary/20 rounded-full blur-[90px] pointer-events-none" />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className="relative z-10 w-full max-w-2xl mx-auto p-8"
      >
        {children}
      </motion.div>
    </div>
  );
}
