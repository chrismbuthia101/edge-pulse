"use client";

import { type FormEvent } from "react";
import Link from "next/link";
import { Zap, ArrowRight, X } from "lucide-react";

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

const socialLinks = [
  {
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    ),
    label: "Follow us on GitHub",
    href: "https://github.com/edgepulse",
  },
  {
    icon: X,
    label: "Follow us on Twitter",
    href: "https://twitter.com/edgepulse",
  },
  {
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
    label: "Follow us on LinkedIn",
    href: "https://linkedin.com/company/edgepulse",
  },
];

export function Footer() {
  const handleNewsletterSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = data.get("email") as string;
    if (email) {
      window.alert(
        `Thanks for subscribing with ${email}! (Demo — no server configured)`,
      );
      (e.target as HTMLFormElement).reset();
    }
  };

  return (
    <footer
      className="relative bg-(--landing-bg) border-t border-(--landing-border) overflow-hidden"
      role="contentinfo"
    >
      {/* Top glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-px bg-linear-to-r from-transparent via-cyan-500/40 to-transparent" />

      <div className="max-w-7xl mx-auto px-6 pt-20 pb-10">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="inline-flex items-center gap-3 mb-6 group"
              aria-label="EdgePulse home"
            >
              <div className="w-9 h-9 rounded-xl bg-linear-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 group-hover:shadow-cyan-500/40 transition-shadow duration-300">
                <Zap
                  className="h-4 w-4 text-white fill-white"
                  aria-hidden="true"
                />
              </div>
              <span className="text-lg font-bold text-(--landing-text)">
                Edge
                <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-400">
                  Pulse
                </span>
              </span>
            </Link>

            <p className="text-sm text-(--landing-text-muted) leading-relaxed mb-6 max-w-xs">
              ML-powered behavioral anomaly detection for enterprise devices.
              Real-time. Offline-capable. Explainable by design.
            </p>

            {/* Newsletter */}
            <form onSubmit={handleNewsletterSubmit} className="flex gap-2">
              <label htmlFor="footer-email" className="sr-only">
                Email address for newsletter
              </label>
              <input
                id="footer-email"
                name="email"
                type="email"
                required
                placeholder="your@email.com"
                className="flex-1 px-4 py-2.5 rounded-xl bg-(--landing-card) border border-(--landing-border) text-sm text-(--landing-text-secondary) placeholder:text-(--landing-text-muted) focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/40 transition-colors"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-linear-to-r from-cyan-500 to-blue-600 text-white hover:opacity-90 transition-opacity cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
                aria-label="Subscribe to newsletter"
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>

            {/* Socials */}
            <div className="flex gap-3 mt-6">
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="w-9 h-9 rounded-lg bg-(--landing-card) border border-(--landing-border) flex items-center justify-center text-(--landing-text-muted) hover:text-(--landing-text) hover:bg-(--landing-card-hover) hover:border-(--landing-border-light) transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Links */}
          {footerLinks.map((section) => (
            <div key={section.title}>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-(--landing-text-muted) mb-5">
                {section.title}
              </h4>
              <ul className="space-y-3" role="list">
                {section.links.map((link) => (
                  <li key={link.l}>
                    <Link
                      href={link.h}
                      className="text-sm text-(--landing-text-muted) hover:text-(--landing-text) transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none rounded"
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
        <div className="pt-8 border-t border-(--landing-border) flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-(--landing-text-muted)">
            © {new Date().getFullYear()} EdgePulse. All rights reserved.
          </p>
          <div
            className="flex items-center gap-2"
            role="status"
            aria-live="polite"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs text-(--landing-text-muted)">
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
