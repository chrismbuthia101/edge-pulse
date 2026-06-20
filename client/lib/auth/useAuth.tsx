"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
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
  activeOrganizationId: string | null;
  hasMultipleOrganizations: boolean;
  switchOrganization: (organizationId: string) => Promise<void>;
}

export function useAuth(): AuthContextType {
  const authStore = useAuthStore();

  useEffect(() => {
    const mounted = true;

    const initializeAuth = async () => {
      if (!mounted) return;
      const store = useAuthStore.getState();
      await store.initialize();
    };

    initializeAuth();
  }, []);

  const profile = authStore.activeOrganizationId
    ? authStore.user?.profiles.find(
        (p) => p.organization_id === authStore.activeOrganizationId,
      )
    : authStore.user?.profiles.find(
        (p) => p.account_status === "ACTIVE" && p.organization_id !== null,
      ) ?? authStore.user?.profiles.find((p) => p.organization_id === null) ?? null;

  const isApproved = profile?.account_status === "ACTIVE";
  const approvalStatus = profile?.account_status ?? null;

  const role = authStore.role;

  return {
    user: authStore.user,
    session: authStore.session,
    role,
    loading: authStore.loading,
    signOut: authStore.signOut,
    refreshSession: authStore.refreshSession,
    hasRole: authStore.hasRole,
    isAdmin: role === "ORG_ADMIN" || role === "PLATFORM_ADMIN",
    isAnalyst: role === "ORG_ANALYST",
    isApproved,
    approvalStatus,
    activeOrganizationId: authStore.activeOrganizationId,
    hasMultipleOrganizations: authStore.hasMultipleOrganizations(),
    switchOrganization: authStore.switchOrganization,
  };
}

export function withRole<T extends object>(
  Component: React.ComponentType<T>,
  requiredRoles: string[],
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
      return null;
    }

    return <Component {...props} />;
  };
}
