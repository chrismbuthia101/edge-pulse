"use client";

import { useEffect } from "react";
import { ServerErrorPage } from "@/components/ui/error-boundary";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Server error:", error);
    document.title = "Server Error - EdgePulse";
  }, [error]);

  return <ServerErrorPage />;
}
