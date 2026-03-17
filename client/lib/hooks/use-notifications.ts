"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAlertStore } from "@/stores/alert-store";
import { useDeviceStore } from "@/stores/device-store";

export type ConnStatus = "live" | "offline" | "syncing";

export function useNotifications() {
    const router = useRouter();

    const [user, setUser] = useState<{ email?: string; full_name?: string } | null>(null);
    const [connStatus, setConnStatus] = useState<ConnStatus>("live");
    const [queuedCount, setQueuedCount] = useState(0);
    const [notifOpen, setNotifOpen] = useState(false);

    const supabase = createClient();
    const supabaseRef = useRef(supabase);
    useEffect(() => {
        supabaseRef.current = supabase;
    });

    const {
        alerts,
        unreadCount,
        loading: alertsLoading,
        error: alertsError,
        initialize: initializeAlerts,
        clearError: clearAlertsError,
        markRead,
    } = useAlertStore();

    const {
        onlineCount,
        loading: devicesLoading,
        error: devicesError,
        initialize: initializeDevices,
        clearError: clearDevicesError,
    } = useDeviceStore();

    useEffect(() => {
        supabaseRef.current.auth.getUser().then(({ data }) => {
            if (data.user) {
                setUser({
                    email: data.user.email,
                    full_name: data.user.user_metadata?.full_name,
                });
            }
        });
    }, []);

    const fetchSyncQueue = useCallback(async () => {
        const { count, error } = await supabaseRef.current
            .from("sync_queue")
            .select("*", { count: "exact", head: true })
            .in("status", ["PENDING", "FAILED"]);

        if (!error) setQueuedCount(count ?? 0);
    }, []);

    useEffect(() => {
        let mounted = true;

        const init = async () => {
            try {
                await Promise.all([initializeAlerts(), initializeDevices()]);
                if (mounted) setConnStatus("live");
            } catch {
                if (mounted) setConnStatus("offline");
            }
        };

        init();
        fetchSyncQueue();

        // Sync-queue channel: flip to "syncing" while the count refreshes.
        const syncChannel = supabaseRef.current
            .channel("realtime-sync-queue")
            .on("postgres_changes", { event: "*", schema: "public", table: "sync_queue" }, () => {
                if (!mounted) return;
                setConnStatus("syncing");
                fetchSyncQueue().then(() => { if (mounted) setConnStatus("live"); });
            })
            .subscribe();

        const handleOnline = () => {
            setConnStatus("syncing");
            init();
            fetchSyncQueue();
            setTimeout(() => setConnStatus("live"), 2_000);
        };
        const handleOffline = () => setConnStatus("offline");

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            mounted = false;
            supabaseRef.current.removeChannel(syncChannel);
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (alertsError) clearAlertsError();
    }, [alertsError, clearAlertsError]);

    useEffect(() => {
        if (devicesError) clearDevicesError();
    }, [devicesError, clearDevicesError]);

    const initials = useMemo(() => {
        if (!user) return "U";
        return user.full_name
            ? user.full_name
                .split(" ")
                .map((n: string) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)
            : user.email?.[0]?.toUpperCase() ?? "U";
    }, [user]);

    const displayName = useMemo(
        () => user?.full_name ?? user?.email?.split("@")[0] ?? "User",
        [user]
    );

    // Only the four most recent alerts are shown in the dropdown.
    const recentNotifs = useMemo(() => alerts.slice(0, 4), [alerts]);

    const isLoading = alertsLoading || devicesLoading;
    const hasError = Boolean(alertsError || devicesError);

    // ── Notification actions ──────────────────────────────────────────────────

    const openNotifications = useCallback(() => setNotifOpen(true), []);
    const closeNotifications = useCallback(() => setNotifOpen(false), []);
    const toggleNotifications = useCallback(() => setNotifOpen((v) => !v), []);

    const handleMarkAllRead = useCallback(() => {
        alerts.forEach((a) => {
            if (!a.read && a.status !== "CLOSED") markRead(a.id);
        });
        setNotifOpen(false);
    }, [alerts, markRead]);

    const handleNotificationClick = useCallback(
        (alertId: string) => {
            markRead(alertId);
            setNotifOpen(false);
            router.push("/dashboard/alerts");
        },
        [markRead, router]
    );

    const handleNotificationKeyDown = useCallback(
        (e: React.KeyboardEvent, index: number) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const next =
                    e.key === "ArrowDown"
                        ? (index + 1) % recentNotifs.length
                        : index === 0 ? recentNotifs.length - 1 : index - 1;

                (
                    document.querySelector(`[data-notif-item="${next}"]`) as HTMLElement | null
                )?.focus();
            } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const alert = recentNotifs[index];
                if (alert) handleNotificationClick(alert.id);
            } else if (e.key === "Escape") {
                setNotifOpen(false);
            }
        },
        [recentNotifs, handleNotificationClick]
    );

    const handleViewAllNotifications = useCallback(() => {
        setNotifOpen(false);
        router.push("/dashboard/notifications");
    }, [router]);

    return {
        user,
        initials,
        displayName,

        connStatus,
        queuedCount,
        isLoading,
        hasError,

        notifOpen,
        openNotifications,
        closeNotifications,
        toggleNotifications,
        recentNotifs,
        unreadCount,
        handleMarkAllRead,
        handleNotificationClick,
        handleNotificationKeyDown,
        handleViewAllNotifications,

        onlineCount,

        markRead,
    } as const;
}