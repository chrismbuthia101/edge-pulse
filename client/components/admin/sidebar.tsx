"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Activity,
  ChevronLeft,
  ChevronRight,
  LogOut,
  HelpCircle,
  Building2,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuthStore } from "@/lib/stores/auth-store";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const navItems: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { icon: Shield, label: "Platform Overview", href: "/admin/overview" },
    ],
  },
  {
    group: "Management",
    items: [
      { icon: Building2, label: "Organizations", href: "/admin/organizations" },
    ],
  },
  {
    group: "Monitoring",
    items: [
      { icon: Activity, label: "Platform Audit Log", href: "/admin/audit-log" },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function AdminSidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const focusTrapRef = useFocusTrap(mobileOpen || false);

  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const handleLogout = async () => {
    setLogoutDialogOpen(true);
  };

  const confirmLogout = async () => {
    setLogoutLoading(true);
    const result = await useAuthStore.getState().signOut();
    setLogoutLoading(false);
    if (result.success) {
      toast.success("Logged out successfully");
      setLogoutDialogOpen(false);
      router.push("/auth/login");
    } else {
      toast.error(result.error || "Failed to sign out");
    }
  };

  const handleNavigation = () => {
    if (window.innerWidth < 1024 && onMobileClose) {
      onMobileClose();
    }
  };

  return (
    <>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed inset-0 bg-black/90 z-30"
            onClick={onMobileClose}
          />
        )}
      </AnimatePresence>

      <motion.aside
        ref={focusTrapRef}
        initial={false}
        animate={{
          width: collapsed ? 68 : 240,
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className={`fixed left-0 top-0 h-screen bg-card border-r border-border z-40 flex flex-col overflow-hidden dark:bg-linear-to-b dark:from-[#0d1420] dark:to-[#0a1118] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        role="navigation"
        aria-label="Admin navigation"
      >
        <div className="h-16 flex items-center px-4 border-b border-border shrink-0">
          <Link
            href="/admin/overview"
            className="flex items-center gap-2.5 overflow-hidden"
            aria-label="EdgePulse Admin"
          >
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
              <Logo className="h-5 w-5 text-violet-500" />
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className="text-base font-display font-bold text-foreground whitespace-nowrap"
                >
                  <span className="text-violet-500">Admin</span>
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
          <div className="ml-auto">
            <button
              onClick={onToggle}
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        <nav
          className="flex-1 py-4 overflow-y-auto overflow-x-hidden scrollbar-none"
          aria-label="Admin navigation"
        >
          {navItems.map((group) => (
            <div key={group.group} className="mb-4">
              <AnimatePresence>
                {!collapsed && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-3 pt-5 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50"
                  >
                    {group.group}
                  </motion.p>
                )}
              </AnimatePresence>

              {group.items.map((item) => {
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 mx-2 px-2 py-2 rounded-lg text-sm transition-all duration-200 group relative",
                      isActive
                        ? "bg-linear-to-r from-violet-500/15 to-violet-500/5 border-l-2 border-violet-500"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                    )}
                    aria-current={isActive ? "page" : undefined}
                    onClick={handleNavigation}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="admin-sidebar-active"
                        className="absolute left-0 top-0 bottom-0 w-0.5 bg-violet-500 rounded-r-full"
                      />
                    )}
                    <item.icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        isActive
                          ? "text-violet-500"
                          : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    <AnimatePresence>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -8 }}
                          transition={{ duration: 0.15 }}
                          className="flex-1 whitespace-nowrap font-medium"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {collapsed && isActive && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0 }}
                        className="absolute inset-0 bg-violet-500/5 rounded-lg border border-violet-500/20 pointer-events-none"
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-border py-3 px-2 space-y-1">
          <button
            className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label="Help & Support"
          >
            <HelpCircle className="h-4 w-4 shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="whitespace-nowrap"
                >
                  Help & Support
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="whitespace-nowrap"
                >
                  Sign Out
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>

      <ConfirmDialog
        open={logoutDialogOpen}
        onOpenChange={setLogoutDialogOpen}
        title="Sign Out"
        description="Are you sure you want to sign out? You will need to sign in again to access the admin panel."
        confirmLabel="Sign Out"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={confirmLogout}
        loading={logoutLoading}
      />
    </>
  );
}
