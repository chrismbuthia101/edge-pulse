"use client";

import { Navigation } from "@/components/landing/navigation";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Trust } from "@/components/landing/trust";
import { Showcase } from "@/components/landing/showcase";
import { Footer } from "@/components/landing/footer";

export function LandingPage() {
  return (
    <main className="min-h-screen bg-[#020617] overflow-x-hidden">
      <Navigation />
      <Hero />
      <Features />
      <Trust />
      <Showcase />
      <Footer />
    </main>
  );
}