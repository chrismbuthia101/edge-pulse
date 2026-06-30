"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { BackgroundLayers } from "@/components/landing/background-layers";

interface DocSection {
  title: string;
  id?: string;
  children: ReactNode;
}

interface DocPageProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  sections?: DocSection[];
}

function DocSection({ title, id, children }: DocSection) {
  return (
    <section id={id} className="mb-12 scroll-mt-24">
      <h2 className="text-2xl font-bold text-(--landing-text) mb-4">{title}</h2>
      {children}
    </section>
  );
}

export function DocPage({ title, subtitle, children }: DocPageProps) {
  return (
    <div className="relative min-h-screen bg-(--landing-bg) overflow-x-hidden">
      <BackgroundLayers grid noise glow="blue" />
      <div className="h-16" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-16 md:py-24">
        <Link
          href="/docs"
          className="inline-flex items-center gap-2 text-sm text-(--landing-text-muted) hover:text-(--landing-text) transition-colors mb-8"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          Back to documentation
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl md:text-5xl font-black text-(--landing-text) mb-4">
            <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-400">
              {title}
            </span>
          </h1>
          {subtitle && (
            <p className="text-lg text-(--landing-text-secondary) mb-10">
              {subtitle}
            </p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="prose-custom"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

export { DocSection };
