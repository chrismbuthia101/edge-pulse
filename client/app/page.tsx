import { Navigation } from "@/components/landing/navigation";
import { Hero } from "@/components/landing/hero";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <Hero />
    </div>
  );
}
