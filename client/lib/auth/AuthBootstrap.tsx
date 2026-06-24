"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function AuthBootstrap() {
  useEffect(() => {
    useAuthStore.getState().initialize();
  }, []);

  return null;
}
