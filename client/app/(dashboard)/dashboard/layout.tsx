"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/topbar";
import { useAuth } from "@/lib/auth/useAuth";
import { resolvePostLoginRoute, useAuthStore } from "@/lib/stores/auth-store";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const profiles = useAuthStore((state) => state.profiles);
    const activeOrganizationId = useAuthStore((state) => state.activeOrganizationId);
    const profileFetchFailed = useAuthStore((state) => state.profileFetchFailed);

    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("sidebar-collapsed");
            return saved !== null ? JSON.parse(saved) : false;
        }
        return false;
    });
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem("sidebar-collapsed", JSON.stringify(sidebarCollapsed));
    }, [sidebarCollapsed]);

    useEffect(() => {
        if (!loading && !user) {
            router.replace("/auth/login");
            return;
        }

        if (!loading && user) {
            const destination = resolvePostLoginRoute(
                profiles,
                activeOrganizationId,
                "/dashboard",
                profileFetchFailed,
            );
            if (destination !== "/dashboard") {
                router.replace(destination);
            }
        }
    }, [loading, user, profiles, activeOrganizationId, profileFetchFailed, router]);

    // Show loading state while checking authentication
    if (loading) {
        return (
            <div className="min-h-screen bg-background dark:bg-[#020617] relative overflow-hidden flex items-center justify-center">
                {/* Ambient glows */}
                <div className="absolute -top-48 -left-48 w-96 h-96 rounded-full bg-glow-primary blur-[120px] pointer-events-none" />
                <div className="absolute -bottom-48 -right-48 w-96 h-96 rounded-full bg-glow-accent blur-[120px] pointer-events-none" />
                <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute bottom-1/4 right-1/4 w-56 h-56 bg-violet-500/10 rounded-full blur-[80px] pointer-events-none" />
                {/* Grid pattern */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <defs>
                        <pattern id="loading-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-light))" strokeWidth="0.8" opacity="0.3" />
                            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-dark))" strokeWidth="0.4" opacity="0.2" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#loading-grid)" />
                </svg>
                <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02] pointer-events-none" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundSize: "200px 200px" }} />
                <div className="relative z-10 animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background dark:bg-[#020617] relative overflow-hidden flex">
            <div className="absolute -top-48 -left-48 w-96 h-96 rounded-full bg-glow-primary blur-[120px] pointer-events-none" />
            <div className="absolute -bottom-48 -right-48 w-96 h-96 rounded-full bg-glow-accent blur-[120px] pointer-events-none" />
            <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-56 h-56 bg-violet-500/10 rounded-full blur-[80px] pointer-events-none" />
            {/* Grid pattern */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                    <pattern id="dashboard-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                        <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-light))" strokeWidth="0.8" opacity="0.3" />
                        <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-dark))" strokeWidth="0.4" opacity="0.2" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#dashboard-grid)" />
            </svg>
            <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02] pointer-events-none" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundSize: "200px 200px" }} />
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => {
                    setSidebarCollapsed((p: boolean) => !p);
                    if (window.innerWidth < 1024) {
                        setMobileSidebarOpen(false);
                    }
                }}
                mobileOpen={mobileSidebarOpen}
                onMobileClose={() => setMobileSidebarOpen(false)}
            />
            <div
                className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarCollapsed ? "lg:ml-17" : "lg:ml-50"
                    } ml-0 ${mobileSidebarOpen ? "lg:backdrop-blur-none backdrop-blur-sm" : ""}`}
            >
                <TopBar onMobileMenuToggle={() => setMobileSidebarOpen(!mobileSidebarOpen)} />
                <main id="main-content" className="flex-1 p-4 lg:p-6 overflow-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}