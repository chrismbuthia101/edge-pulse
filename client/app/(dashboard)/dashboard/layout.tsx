"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/topbar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Initialize sidebar state from localStorage or default to false
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("sidebar-collapsed");
            return saved !== null ? JSON.parse(saved) : false;
        }
        return false;
    });
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    // Save sidebar state to localStorage when it changes
    useEffect(() => {
        localStorage.setItem("sidebar-collapsed", JSON.stringify(sidebarCollapsed));
    }, [sidebarCollapsed]);

    return (
        <div className="min-h-screen bg-background flex">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => {
                    setSidebarCollapsed((p: boolean) => !p);
                    // Close mobile sidebar when toggling desktop state
                    if (window.innerWidth < 1024) {
                        setMobileSidebarOpen(false);
                    }
                }}
                mobileOpen={mobileSidebarOpen}
                onMobileClose={() => setMobileSidebarOpen(false)}
            />
            <div
                className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarCollapsed ? "lg:ml-[68px]" : "lg:ml-[240px]"
                    } ml-0 ${mobileSidebarOpen ? "lg:backdrop-blur-none backdrop-blur-sm" : ""}`}
            >
                <TopBar onMobileMenuToggle={() => setMobileSidebarOpen(!mobileSidebarOpen)} />
                <main id="main-content" className="flex-1 p-4 lg:p-6 overflow-auto">{children}</main>
            </div>
        </div>
    );
}