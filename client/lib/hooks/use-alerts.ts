"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useAlertStore } from "@/lib/stores/alert-store";
import { createClient } from "@/lib/config/client";
import type { Alert, AlertStatus } from "@/lib/types/alerts";

export type AlertFilter = "ALL" | "PENDING" | "IN_REVIEW" | "CLOSED";

const NEXT_STATUS: Record<AlertStatus, AlertStatus | null> = {
  PENDING: "ACKNOWLEDGED",
  ACKNOWLEDGED: "INVESTIGATED",
  INVESTIGATED: "CLOSED",
  CLOSED: null,
};

export function useAlerts() {
  const [filter, setFilter] = useState<AlertFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const {
    alerts,
    pendingCount,
    status,
    error,
    initialize,
    updateAlertStatus,
    clearError,
  } = useAlertStore();

  useEffect(() => {
    initialize(createClient());
  }, [initialize]);

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Surface store errors as toasts and clear them immediately.
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const filtered = useMemo<Alert[]>(() => {
    switch (filter) {
      case "PENDING":
        return alerts.filter((a) => a.status === "PENDING");
      case "IN_REVIEW":
        return alerts.filter(
          (a) => a.status === "ACKNOWLEDGED" || a.status === "INVESTIGATED",
        );
      case "CLOSED":
        return alerts.filter((a) => a.status === "CLOSED");
      default:
        return alerts.filter((a) => a.status !== "CLOSED");
    }
  }, [alerts, filter]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleResolve = useCallback(
    async (
      e: React.MouseEvent,
      alertId: string,
      currentStatus: AlertStatus,
    ) => {
      e.stopPropagation();
      const next = NEXT_STATUS[currentStatus];
      if (!next) return;
      await updateAlertStatus(alertId, next);
    },
    [updateAlertStatus],
  );

  const handleDismiss = useCallback(
    async (e: React.MouseEvent, alertId: string) => {
      e.stopPropagation();
      await updateAlertStatus(alertId, "CLOSED");
    },
    [updateAlertStatus],
  );

  const relativeTime = useCallback(
    (iso: string): string => {
      const diff = currentTime - new Date(iso).getTime();
      const m = Math.floor(diff / 60_000);
      if (m < 1) return "just now";
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return `${Math.floor(h / 24)}d ago`;
    },
    [currentTime],
  );

  return {
    alerts,
    filtered,
    pendingCount,
    loading: status === "loading",

    filter,
    setFilter,

    selectedId,
    toggleSelected,

    handleResolve,
    handleDismiss,

    relativeTime,
  } as const;
}
