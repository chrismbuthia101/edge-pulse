"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import type { AuthUser } from "@/lib/repositories/auth-repository";
import type { Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  role: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasRole: (roles: string[]) => boolean;
  isAdmin: boolean;
  isAnalyst: boolean;
  isApproved: boolean;
  approvalStatus: string | null;
  resetInactivityTimer: () => void;
}

export function useAuth(): AuthContextType {
  const authStore = useAuthStore();

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      if (!mounted) return;
      const store = useAuthStore.getState();
      await store.initialize();
    };

    initializeAuth();

    const activityEvents = [
      'mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart',
      'click', 'keydown', 'keyup', 'focus', 'blur'
    ];

    const handleActivity = () => {
      const store = useAuthStore.getState();
      store.resetInactivityTimer();
    };

    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const store = useAuthStore.getState();
        store.resetInactivityTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;

      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const isApproved = authStore.user?.approval_status === 'APPROVED' && authStore.user?.is_active === true;
  const approvalStatus = authStore.user?.approval_status || null;

  return {
    user: authStore.user,
    session: authStore.session,
    role: authStore.role,
    loading: authStore.loading,
    signOut: authStore.signOut,
    refreshSession: authStore.refreshSession,
    hasRole: authStore.hasRole,
    isAdmin: authStore.isAdmin,
    isAnalyst: authStore.isAnalyst,
    isApproved,
    approvalStatus,
    resetInactivityTimer: authStore.resetInactivityTimer,
  };
}

export function withRole<T extends object>(
  Component: React.ComponentType<T>,
  requiredRoles: string[]
) {
  return function RoleProtectedComponent(props: T) {
    const { hasRole, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!loading && !hasRole(requiredRoles)) {
        router.push("/dashboard");
        toast.error("You don't have permission to access this page");
      }
    }, [hasRole, loading, router]);

    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (!hasRole(requiredRoles)) {
      return null; // Will redirect
    }

    return <Component {...props} />;
  };
}
