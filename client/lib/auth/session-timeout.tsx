"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { toast } from "sonner";

const SESSION_TIMEOUT_MS = 60 * 60 * 1000;
const WARNING_BEFORE_MS = 60 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "wheel", "mousemove"];

export default function SessionTimeout() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
  }, []);

  const startTimer = useCallback(() => {
    clearTimers();

    warningRef.current = setTimeout(() => {
      toast.warning("Session timeout", {
        description: "You'll be logged out in 1 minute due to inactivity.",
        duration: 55_000,
      });
    }, SESSION_TIMEOUT_MS - WARNING_BEFORE_MS);

    timerRef.current = setTimeout(async () => {
      await useAuthStore.getState().signOut();
      router.push("/auth/login");
    }, SESSION_TIMEOUT_MS);
  }, [clearTimers, router]);

  const resetTimer = useCallback(() => {
    const status = useAuthStore.getState().status;
    if (status !== "authenticated") return;
    startTimer();
  }, [startTimer]);

  useEffect(() => {
    const unsub = useAuthStore.subscribe((state) => {
      if (state.status === "authenticated") startTimer();
      if (state.status === "unauthenticated") clearTimers();
    });

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, resetTimer, { passive: true }),
    );
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resetTimer();
    });

    return () => {
      unsub();
      clearTimers();
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, resetTimer),
      );
    };
  }, [startTimer, resetTimer, clearTimers]);

  return null;
}
