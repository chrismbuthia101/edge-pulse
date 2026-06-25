"use client";

import { motion } from "framer-motion";
import { AuthPageBackground } from "@/components/auth/auth-visual-panel";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center">
      <AuthPageBackground variant="register" />
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
