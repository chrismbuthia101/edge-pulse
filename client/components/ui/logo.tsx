"use client";

import Image from "next/image";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/images/edgelogo.jpg"
      alt="EdgePulse Logo"
      width={32}
      height={32}
      className={className}
    />
  );
}
