"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Activity, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

const footerSections = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Security", href: "#security" },
      { label: "Pricing", href: "#pricing" },
      { label: "Documentation", href: "/docs" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#about" },
      { label: "Blog", href: "/blog" },
      { label: "Careers", href: "/careers" },
      { label: "Contact", href: "#contact" },
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
    <footer className="bg-muted/30 border-t border-border/50">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-12">
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="lg:col-span-2"
          >
            <Link href="/" className="flex items-center gap-2 mb-4" aria-label="EdgePulse Home">
              <Activity className="h-8 w-8 text-primary" />
              <span className="text-xl font-display font-bold">
                Edge<span className="text-primary">Pulse</span>
              </span>
            </Link>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Advanced edge-based security solution powered by machine learning. 
              Protect your enterprise devices with real-time threat detection.
            </p>
            <div className="flex gap-4">
              <Button variant="outline" size="sm" asChild>
                <Link href="/contact" aria-label="Contact us">
                  <Mail className="w-4 h-4 mr-2" />
                  Contact
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/register" aria-label="Get started with EdgePulse">
                  Get Started
                </Link>
              </Button>
            </div>
          </motion.div>

          {/* Links */}
          {footerSections.map((section, index) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <h3 className="font-semibold mb-4">{section.title}</h3>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground transition-colors text-sm"
                      aria-label={`Navigate to ${link.label}`}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Bottom */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="border-t border-border/50 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4"
        >
          <p className="text-sm text-muted-foreground">
            © 2024 EdgePulse. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span>Built with ❤️ for enterprise security</span>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
