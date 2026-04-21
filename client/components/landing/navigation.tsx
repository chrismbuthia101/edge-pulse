"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { Menu, X, Zap } from "lucide-react";

const navItems = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Security", href: "#security" },
  { label: "About", href: "#about" },
];

export function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [, setScrolled] = useState(false);
  const { scrollY } = useScroll();

  const navBg = useTransform(scrollY, [0, 80], ["rgba(2,6,23,0)", "rgba(2,6,23,0.95)"]);
  const navBorder = useTransform(scrollY, [0, 80], ["rgba(255,255,255,0)", "rgba(255,255,255,0.06)"]);

  useEffect(() => {
    return scrollY.onChange((v) => setScrolled(v > 60));
  }, [scrollY]);

  const handleNavClick = (href: string) => {
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileOpen(false);
  };

  return (
    <motion.nav
      style={{ backgroundColor: navBg, borderBottomColor: navBorder }}
      className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-xl"
    >
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-linear-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 group-hover:shadow-cyan-500/50 transition-shadow duration-300">
                <Zap className="h-4 w-4 text-white fill-white" />
              </div>
              <div className="absolute -inset-0.5 rounded-xl bg-linear-to-br from-cyan-400 to-blue-600 opacity-0 group-hover:opacity-40 blur-sm transition-opacity duration-300" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              Edge<span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-400">Pulse</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => handleNavClick(item.href)}
                className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white rounded-lg hover:bg-white/5 transition-all duration-200"
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/auth/login"
              className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-colors duration-200"
            >
              Sign In
            </Link>
            <Link
              href="/auth/register"
              className="relative px-5 py-2 text-sm font-semibold text-white rounded-xl overflow-hidden group"
            >
              <div className="absolute inset-0 bg-linear-to-r from-cyan-500 to-blue-600 transition-all duration-300 group-hover:opacity-90" />
              <div className="absolute inset-0 bg-linear-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl" />
              <span className="relative">Get Started →</span>
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 text-white"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden border-t border-white/5 bg-[#020617]/95 backdrop-blur-xl overflow-hidden"
          >
            <div className="px-6 py-4 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.href}
                  onClick={() => handleNavClick(item.href)}
                  className="block w-full text-left px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                >
                  {item.label}
                </button>
              ))}
              <div className="pt-3 border-t border-white/5 flex flex-col gap-2">
                <Link href="/auth/login" className="px-4 py-3 text-sm text-white/70 hover:text-white transition-colors">
                  Sign In
                </Link>
                <Link href="/auth/register" className="px-4 py-3 text-sm font-semibold text-center text-white rounded-xl bg-linear-to-r from-cyan-500 to-blue-600">
                  Get Started →
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}