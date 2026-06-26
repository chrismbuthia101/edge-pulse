"use client";

import { type FormEvent } from "react";
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

const socialLinks = [
  {
    icon: Github,
    label: "Follow us on GitHub",
    href: "https://github.com/edgepulse",
  },
  {
    icon: Twitter,
    label: "Follow us on Twitter",
    href: "https://twitter.com/edgepulse",
  },
  {
    icon: Linkedin,
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
