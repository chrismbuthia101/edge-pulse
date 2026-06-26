"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  motion,
  AnimatePresence,
  useScroll,
  useReducedMotion,
} from "framer-motion";
import { Menu, X, Zap } from "lucide-react";

const navItems = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Security", href: "#security" },
  { label: "About", href: "#about" },
];

const itemVariants = {
  open: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  closed: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

export function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    return scrollY.on("change", (v) => setScrolled(v > 60));
  }, [scrollY]);

  const handleNavClick = (href: string) => {
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileOpen(false);
  };

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-xl transition-all duration-300 ${scrolled ? "bg-(--landing-bg)/95 border-b border-(--landing-border)" : "bg-transparent border-b border-transparent"}`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-3 group"
            aria-label="EdgePulse home"
          >
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-linear-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 group-hover:shadow-cyan-500/50 transition-shadow duration-300">
                <Zap
                  className="h-4 w-4 text-white fill-white"
                  aria-hidden="true"
                />
              </div>
              <div className="absolute -inset-0.5 rounded-xl bg-linear-to-br from-cyan-400 to-blue-600 opacity-0 group-hover:opacity-40 blur-sm transition-opacity duration-300" />
            </div>
            <span className="text-lg font-bold tracking-tight text-(--landing-text)">
              Edge
              <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-400">
                Pulse
              </span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1" role="menubar">
            {navItems.map((item) => (
              <button
                key={item.href}
                role="menuitem"
                onClick={() => handleNavClick(item.href)}
                className="px-4 py-2 text-sm font-medium text-(--landing-text-secondary) hover:text-(--landing-text) rounded-lg hover:bg-(--landing-card-hover) transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/auth/login"
              className="px-4 py-2 text-sm font-medium text-(--landing-text-secondary) hover:text-(--landing-text) transition-colors duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none rounded-lg"
            >
              Sign In
            </Link>
            <Link
              href="/auth/register"
              className="relative px-5 py-2 text-sm font-semibold text-white rounded-xl overflow-hidden group cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            >
              <div className="absolute inset-0 bg-linear-to-r from-cyan-500 to-blue-600 transition-all duration-300 group-hover:opacity-90" />
              <div className="absolute inset-0 bg-linear-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl" />
              <span className="relative">Get Started →</span>
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg bg-(--landing-card) text-(--landing-text) cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={{
              open: { height: "auto", opacity: 1 },
              closed: { height: 0, opacity: 0 },
            }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="md:hidden border-t border-(--landing-border) bg-(--landing-bg)/95 backdrop-blur-xl overflow-hidden"
          >
            <div className="px-6 py-4 space-y-1">
              {navItems.map((item) => (
                <motion.div
                  key={item.href}
                  variants={prefersReducedMotion ? {} : itemVariants}
                >
                  <button
                    onClick={() => handleNavClick(item.href)}
                    className="block w-full text-left px-4 py-3 text-sm text-(--landing-text-secondary) hover:text-(--landing-text) hover:bg-(--landing-card-hover) rounded-lg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
                  >
                    {item.label}
                  </button>
                </motion.div>
              ))}
              <div className="pt-3 border-t border-(--landing-border) flex flex-col gap-2">
                <Link
                  href="/auth/login"
                  className="px-4 py-3 text-sm text-(--landing-text-secondary) hover:text-(--landing-text) transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none rounded-lg"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/register"
                  className="px-4 py-3 text-sm font-semibold text-center text-white rounded-xl bg-linear-to-r from-cyan-500 to-blue-600 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
                >
                  Get Started →
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
