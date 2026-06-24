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
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <pattern
              id="admin-loading-grid"
              width="48"
              height="48"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 48 0 L 0 0 0 48"
                fill="none"
                stroke="hsl(var(--grid-light))"
                strokeWidth="0.8"
                opacity="0.3"
              />
              <path
                d="M 48 0 L 0 0 0 48"
                fill="none"
                stroke="hsl(var(--grid-dark))"
                strokeWidth="0.4"
                opacity="0.2"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#admin-loading-grid)" />
        </svg>
        <div className="relative z-10 animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasRole(["PLATFORM_ADMIN"])) return null;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex">
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <pattern
            id="admin-grid"
            width="48"
            height="48"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="hsl(var(--grid-light))"
              strokeWidth="0.8"
              opacity="0.3"
            />
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="hsl(var(--grid-dark))"
              strokeWidth="0.4"
              opacity="0.2"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#admin-grid)" />
      </svg>
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
