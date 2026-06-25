"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

interface AuthLayoutProps {
  leftPanel?: ReactNode;
  rightPanel: ReactNode;
  mobileLogo?: boolean;
  centered?: boolean;
}

function GridBackground() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="auth-grid"
          width="48"
          height="48"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 48 0 L 0 0 0 48"
            fill="none"
            stroke="hsl(var(--grid-light))"
            strokeWidth="0.8"
            opacity="0.3"
          />
          <path
            d="M 48 0 L 0 0 0 48"
            fill="none"
            stroke="hsl(var(--grid-dark))"
            strokeWidth="0.4"
            opacity="0.2"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#auth-grid)" />
    </svg>
  );
}

export function AuthLayout({
  leftPanel,
  rightPanel,
  mobileLogo = true,
  centered = false,
}: AuthLayoutProps) {
  if (centered) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <GridBackground />
        <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-56 h-56 bg-violet-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="relative z-10 min-h-screen flex items-center justify-center p-8">
          {rightPanel}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <GridBackground />
      <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-56 h-56 bg-violet-500/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative z-10 min-h-screen flex">
        {/* ── Left decorative panel ── */}
        {leftPanel && (
          <div className="hidden lg:flex lg:w-1/2 relative">
            {/* Logo */}
            <div className="absolute top-8 left-8 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Logo className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xl font-sans font-bold text-foreground">
                Edge<span className="text-primary">Pulse</span>
              </span>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center p-12">
              {leftPanel}
            </div>
          </div>
        )}

        {/* ── Right form panel ── */}
        <div className={`flex-1 flex flex-col ${leftPanel ? "" : "lg:pl-0"}`}>
          {/* Top bar */}
          <div className="flex items-center justify-between px-8 py-5">
            {mobileLogo && (
              <Link
                href="/"
                className="flex items-center gap-2 lg:hidden"
                aria-label="EdgePulse home"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Logo className="h-4 w-4 text-primary" />
                </div>
                <span className="text-lg font-sans font-bold">
                  Edge<span className="text-primary">Pulse</span>
                </span>
              </Link>
            )}
            <div className={`${mobileLogo ? "hidden lg:block" : "block"}`} />
          </div>

          {/* Form area */}
          <div className="flex-1 flex flex-col p-8 pt-4 lg:items-center lg:justify-center">
            {rightPanel}
          </div>
        </div>
      </div>
    </div>
  );
}
