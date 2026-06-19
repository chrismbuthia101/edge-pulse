"use client";

import Link from "next/link";
import { Zap, ArrowRight, Github, Twitter, Linkedin } from "lucide-react";

const footerLinks = [
  {
    title: "Product",
    links: [
      { l: "Features", h: "#features" },
      { l: "How It Works", h: "#how-it-works" },
      { l: "Security", h: "#security" },
      { l: "Documentation", h: "/docs" },
    ],
  },
  {
    title: "Company",
    links: [
      { l: "About", h: "#about" },
      { l: "Blog", h: "/blog" },
      { l: "Careers", h: "/careers" },
      { l: "Contact", h: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { l: "Privacy Policy", h: "/privacy" },
      { l: "Terms of Service", h: "/terms" },
      { l: "GDPR", h: "/gdpr" },
      { l: "SOC 2", h: "/soc2" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative bg-[#020617] border-t border-white/5 overflow-hidden">
      {/* Top glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-px bg-linear-to-r from-transparent via-cyan-500/40 to-transparent" />

      <div className="max-w-7xl mx-auto px-6 pt-20 pb-10">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="inline-flex items-center gap-3 mb-6 group"
            >
              <div className="w-9 h-9 rounded-xl bg-linear-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 group-hover:shadow-cyan-500/40 transition-shadow duration-300">
                <Zap className="h-4 w-4 text-white fill-white" />
              </div>
              <span className="text-lg font-bold text-white">
                Edge
                <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-400">
                  Pulse
                </span>
              </span>
            </Link>

            <p className="text-sm text-white/35 leading-relaxed mb-6 max-w-xs">
              ML-powered behavioral anomaly detection for enterprise devices.
              Real-time. Offline-capable. Explainable by design.
            </p>

            {/* Newsletter */}
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="your@email.com"
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/4 border border-white/8 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-cyan-500/40 transition-colors"
              />
              <button className="px-4 py-2.5 rounded-xl bg-linear-to-r from-cyan-500 to-blue-600 text-white hover:opacity-90 transition-opacity">
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* Socials */}
            <div className="flex gap-3 mt-6">
              {[Github, Twitter, Linkedin].map((Icon, i) => (
                <button
                  key={i}
                  className="w-9 h-9 rounded-lg bg-white/4 border border-white/8 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 hover:border-white/15 transition-all duration-200"
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Links */}
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h4 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-5">
                {section.title}
              </h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.l}>
                    <Link
                      href={link.h}
                      className="text-sm text-white/30 hover:text-white/70 transition-colors duration-200"
                    >
                      {link.l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/25">
            © {new Date().getFullYear()} EdgePulse. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-white/25">
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
