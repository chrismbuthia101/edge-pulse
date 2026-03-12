"use client";

import { useEffect } from "react";
import { NotFoundPage } from "@/components/ui/error-boundary";

export default function NotFound() {
  useEffect(() => {
    document.title = "Page Not Found - EdgePulse";
  }, []);

  return <NotFoundPage />;
}
