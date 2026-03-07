"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Shield, Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const footerSections = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Security", href: "#security" },
      { label: "How It Works", href: "#how-it-works" },
      { label: "Documentation", href: "/docs" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#about" },
      { label: "Blog", href: "/blog" },
      { label: "Careers", href: "/careers" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Cookie Policy", href: "/cookies" },
      { label: "GDPR", href: "/gdpr" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-background border-t border-border">
      <div className="max-w-7xl mx-auto px-6 pt-16 pb-10">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          {/* Brand column */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="lg:col-span-2"
          >
            <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <span className="text-lg font-display font-bold text-foreground">
                Edge<span className="text-primary">Pulse</span>
              </span>
            </Link>

            <p className="text-sm text-muted-foreground leading-relaxed mb-5 max-w-xs">
              Advanced edge security powered by machine learning. Protect your enterprise devices
              with real-time, explainable, privacy-first threat detection.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href="/contact">
                  <Mail className="w-3.5 h-3.5" />
                  Contact Us
                </Link>
              </Button>
              <Button size="sm" className="gap-1.5" asChild>
                <Link href="/register">
                  Get Started
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
            </div>
          </motion.div>

          {/* Link columns */}
          {footerSections.map((section, index) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground mb-4">
                {section.title}
              </h3>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} EdgePulse. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              All systems operational
            </span>
            <span>Built for enterprise security</span>
          </div>
        </div>
      </div>
    </footer>
  );
}