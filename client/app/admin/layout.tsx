"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopBar } from "@/components/admin/topbar";
import { useAuth } from "@/lib/auth/useAuth";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("admin-sidebar-collapsed");
      return saved !== null ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(
      "admin-sidebar-collapsed",
      JSON.stringify(sidebarCollapsed),
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
      return;
    }

    if (!loading && user && !hasRole(["PLATFORM_ADMIN"])) {
      router.replace("/dashboard");
    }
  }, [loading, user, hasRole, router]);

  if (loading) {
    return (
      <div className="relative min-h-screen bg-background overflow-hidden flex items-center justify-center">
        <div className="absolute -top-48 -left-48 w-96 h-96 rounded-full bg-glow-primary blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-48 -right-48 w-96 h-96 rounded-full bg-glow-accent blur-[120px] pointer-events-none" />
        <div className="relative z-10 animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasRole(["PLATFORM_ADMIN"])) return null;

  return (
    <div className="relative min-h-screen bg-background overflow-hidden flex">
      {/* Ambient glows */}
      <div className="absolute -top-48 -left-48 w-96 h-96 rounded-full bg-glow-primary blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-48 -right-48 w-96 h-96 rounded-full bg-glow-accent blur-[120px] pointer-events-none" />
      <AdminSidebar
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
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${
          sidebarCollapsed ? "lg:ml-17" : "lg:ml-60"
        } ml-0 ${mobileSidebarOpen ? "lg:backdrop-blur-none backdrop-blur-sm" : ""}`}
      >
        <AdminTopBar
          onMobileMenuToggle={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        />
        <main id="main-content" className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
