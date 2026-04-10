"use client";

import { Navigation } from "@/components/landing/navigation";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Trust } from "@/components/landing/trust";
import { Showcase } from "@/components/landing/showcase";
import { Footer } from "@/components/landing/footer";

export function LandingPage() {
  return (
    <main className="min-h-screen overflow-y-auto bg-linear-to-br from-slate-900 via-blue-950 to-slate-900">
      <Navigation />
      <Hero />
      <Features />
      <Trust />
      <Showcase />
      <Footer />
    </main>
  );
}