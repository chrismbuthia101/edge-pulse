"use client";

import { Navigation } from "@/components/landing/navigation";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Trust } from "@/components/landing/trust";
import { Showcase } from "@/components/landing/showcase";
import { Footer } from "@/components/landing/footer";

export function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "EdgePulse",
            applicationCategory: "SecurityApplication",
            operatingSystem: "Linux, macOS, Windows",
            description:
              "ML-powered behavioral anomaly detection for enterprise devices. Real-time. Offline-capable. Explainable by design.",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
            featureList: [
              "Real-time ML threat detection",
              "SHAP-powered explainable AI",
              "2MB edge-native agents",
              "Offline resilience",
              "Privacy-first architecture",
            ],
          }),
        }}
      />

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-cyan-500 focus:text-white focus:text-sm focus:font-bold focus:outline-none"
      >
        Skip to main content
      </a>

      <main
        id="main-content"
        className="relative min-h-screen bg-(--landing-bg) overflow-x-hidden"
      >
        <Navigation />
        <Hero />
        <Features />
        <Trust />
        <Showcase />
        <Footer />
      </main>
    </>
  );
}
