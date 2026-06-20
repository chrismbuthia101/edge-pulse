"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/topbar";
import { useAuth } from "@/lib/auth/useAuth";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, loading, isApproved } = useAuth();
    const router = useRouter();

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
        if (!loading && user && !isApproved) {
            if (user.profiles.some((p) => p.account_status === "PENDING")) {
                router.push("/auth/setup-profile");
            }
            return;
        }
        if (!loading && isApproved && user && !user.organization_id && user.role !== "PLATFORM_ADMIN") {
            router.push("/auth/setup-organization");
        }
    }, [loading, isApproved, user, router]);

    // Show loading state while checking authentication
    if (loading) {
        return (
            <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
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
                <div className="relative z-10 animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    // Show approval pending screen if user is not approved
    if (!user || !isApproved) {
        return (
            <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
                {/* Grid pattern */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <defs>
                        <pattern id="approval-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-light))" strokeWidth="0.8" opacity="0.3" />
                            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-dark))" strokeWidth="0.4" opacity="0.2" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#approval-grid)" />
                </svg>
                <div className="relative z-10 text-center max-w-md mx-auto p-6">
                    <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">
                        Account Pending Approval
                    </h2>
                    <p className="text-muted-foreground mb-6">
                        Your account is awaiting administrator approval. You will receive access once an administrator has reviewed and approved your registration.
                    </p>
                    <div className="space-y-2 text-sm text-muted-foreground">
                        <p>• Status: <span className="text-orange-600 font-medium">Pending Approval</span></p>
                        <p>• Email: {user?.email || 'Unknown'}</p>
                    </div>
                    <div className="mt-8 pt-6 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                            If you believe this is an error, please contact your system administrator.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background relative overflow-hidden flex">
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
                className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarCollapsed ? "lg:ml-17" : "lg:ml-60"
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