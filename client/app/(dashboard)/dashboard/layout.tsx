"use client";

import { useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/topbar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-background flex">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => {
                    setSidebarCollapsed((p) => !p);
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
                <main className="flex-1 p-4 lg:p-6 overflow-auto">{children}</main>
            </div>
        </div>
    );
}