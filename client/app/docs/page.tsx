"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  Terminal,
  Settings,
  Cpu,
  Shield,
  Bot,
  BookText,
  HelpCircle,
  ChevronRight
} from "lucide-react";
import { BackgroundLayers } from "@/components/landing/background-layers";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DocSection {
  title: string;
  description: string;
  href: string;
  icon: typeof BookOpen;
  gradient: string;
  badge?: string;
}

const docSections: DocSection[] = [
  {
    title: "Getting Started",
    description: "Quick-start guide to deploy EdgePulse agents and connect them to your dashboard in minutes.",
    href: "/docs/getting-started",
    icon: BookOpen,
    gradient: "from-cyan-500 to-blue-600",
    badge: "Recommended",
  },
  {
    title: "Installation",
    description: "Supported platforms, system requirements, and installation instructions for Linux, Windows, and more.",
    href: "/docs/installation",
    icon: Terminal,
    gradient: "from-violet-500 to-purple-600",
  },
  {
    title: "Agent Configuration",
    description: "Configure the edge agent via YAML files, environment variables, or the CLI flags.",
    href: "/docs/configuration",
    icon: Settings,
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    title: "CLI Reference",
    description: "Complete reference for the EdgePulse CLI — install, start, stop, logs, and diagnostics commands.",
    href: "/docs/cli",
    icon: Cpu,
    gradient: "from-amber-500 to-orange-600",
  },
  {
    title: "Dashboard Guide",
    description: "Navigate alerts, ML insights, device fleet management, and reporting in the EdgePulse dashboard.",
    href: "/docs/dashboard",
    icon: Bot,
    gradient: "from-pink-500 to-rose-600",
  },
  {
    title: "Architecture",
    description: "System design overview — edge agent lifecycle, data pipeline, ML inference, and offline resilience.",
    href: "/docs/architecture",
    icon: BookText,
    gradient: "from-sky-500 to-indigo-600",
  },
  {
    title: "Security & Privacy",
    description: "Encryption, data handling, privacy-first architecture, and compliance with enterprise security standards.",
    href: "/docs/security",
    icon: Shield,
    gradient: "from-red-500 to-rose-600",
  },
  {
    title: "FAQ",
    description: "Frequently asked questions about deployment, troubleshooting, and best practices.",
    href: "/docs/faq",
    icon: HelpCircle,
    gradient: "from-gray-500 to-slate-600",
  },
];

export default function DocsPage() {
  return (
    <div className="relative min-h-screen bg-(--landing-bg) overflow-x-hidden">
      <BackgroundLayers grid noise glow="blue" />

      {/* Nav bar spacer */}
      <div className="h-16" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-16 md:py-24">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-(--landing-text-muted) hover:text-(--landing-text) transition-colors mb-8"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to home
          </Link>

          <h1 className="text-4xl md:text-6xl font-black text-(--landing-text) mb-4">
            <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-400">
              Documentation
            </span>
          </h1>

          <p className="text-lg text-(--landing-text-secondary) max-w-2xl mx-auto">
            Everything you need to deploy, configure, and manage EdgePulse in your
            enterprise environment.
          </p>
        </motion.div>

        {/* Doc cards grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {docSections.map((section, i) => (
            <motion.div
              key={section.href}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
            >
              <Link href={section.href} className="block h-full group">
                <Card className="bg-(--landing-card) border-(--landing-border) h-full transition-all duration-200 group-hover:border-(--landing-border-light) group-hover:bg-(--landing-card-hover)">
                  <CardHeader>
                    <div className="flex items-start justify-between mb-3">
                      <div
                        className={`w-10 h-10 rounded-xl bg-linear-to-br ${section.gradient} flex items-center justify-center shadow-lg shadow-${section.gradient.split(" ")[0].replace("from-", "")}/25 group-hover:scale-105 transition-transform duration-200`}
                      >
                        <section.icon className="h-5 w-5 text-white" aria-hidden="true" />
                      </div>
                      {section.badge && (
                        <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 text-cyan-400 border-cyan-400/30">
                          {section.badge}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-(--landing-text) text-sm group-hover:text-cyan-400 transition-colors">
                      {section.title}
                    </CardTitle>
                    <CardDescription className="text-(--landing-text-muted) text-xs leading-relaxed">
                      {section.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-20 text-center"
        >
          <p className="text-sm text-(--landing-text-muted) mb-4">
            Still have questions?
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors underline underline-offset-4"
          >
            Contact support
            <ChevronRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
