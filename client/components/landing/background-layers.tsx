"use client";

import { type ReactNode } from "react";

interface BackgroundLayersProps {
  children?: ReactNode;
  grid?: boolean;
  noise?: boolean;
  glow?: "cyan" | "blue" | "violet" | "mixed" | null;
  className?: string;
}

const GLOW_MAP = {
  cyan: "radial-gradient(circle, #0891b2 0%, transparent 70%)",
  blue: "radial-gradient(circle, #1d4ed8 0%, transparent 70%)",
  violet: "radial-gradient(circle, #7c3aed 0%, transparent 70%)",
  mixed: "radial-gradient(ellipse, #0891b2 0%, #1d4ed8 40%, transparent 70%)",
} as const;

export function BackgroundLayers({
  children,
  grid = true,
  noise = true,
  glow = null,
  className = "",
}: BackgroundLayersProps) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
    >
      {noise && (
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            backgroundSize: "200px 200px",
          }}
        />
      )}

      {grid && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
      )}

      {glow && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] opacity-[0.12]"
          style={{
            background: GLOW_MAP[glow],
            filter: "blur(80px)",
          }}
        />
      )}

      {children}
    </div>
  );
}
