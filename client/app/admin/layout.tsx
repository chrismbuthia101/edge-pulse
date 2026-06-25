"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopBar } from "@/components/admin/topbar";
import { useAuth } from "@/lib/auth/useAuth";
import { AuthPageBackground } from "@/components/auth/auth-visual-panel";

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
      <div className="relative min-h-screen overflow-hidden flex items-center justify-center">
        <AuthPageBackground variant="login" />
        <div className="relative z-10 animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  if (!hasRole(["PLATFORM_ADMIN"])) return null;

  return (
    <div
      className="relative min-h-screen overflow-hidden flex"
      style={{
        "--background": "218 33% 6%",
        "--foreground": "210 20% 90%",
        "--card": "218 30% 9%",
        "--card-foreground": "210 20% 90%",
        "--popover": "216 25% 10%",
        "--popover-foreground": "210 20% 90%",
        "--primary": "199 95% 50%",
        "--primary-foreground": "216 28% 7%",
        "--secondary": "216 22% 15%",
        "--secondary-foreground": "210 20% 80%",
        "--muted": "218 25% 13%",
        "--muted-foreground": "215 15% 52%",
        "--accent": "194 40% 18%",
        "--accent-foreground": "194 100% 70%",
        "--destructive": "0 75% 55%",
        "--destructive-foreground": "0 0% 100%",
        "--border": "215 50% 20%",
        "--input": "216 20% 16%",
        "--ring": "194 100% 50%",
        "--sidebar": "216 25% 10%",
        "--sidebar-foreground": "210 20% 90%",
        "--sidebar-primary": "194 100% 50%",
        "--sidebar-primary-foreground": "216 28% 7%",
        "--sidebar-accent": "216 22% 15%",
        "--sidebar-accent-foreground": "210 20% 80%",
        "--sidebar-border": "216 20% 18%",
        "--sidebar-ring": "194 100% 50%",
        "--grid-light": "215 35% 25%",
        "--grid-dark": "215 25% 85%",
      } as React.CSSProperties}
    >
      <AuthPageBackground variant="login" />
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
