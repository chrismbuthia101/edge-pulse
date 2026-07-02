"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, deriveActiveProfile } from "@/lib/stores/auth-store";
import type { AuthUser } from "@/lib/stores/auth-store";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  role: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasRole: (roles: string[]) => boolean;
  activeOrganizationId: string | null;
  hasMultipleOrganizations: boolean;
  switchOrganization: (organizationId: string) => Promise<void>;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  challengeMFA: () => Promise<void>;
  verifyMFA: (code: string) => Promise<void>;
  enrollMFA: () => Promise<void>;
  unenrollMFA: () => Promise<void>;
}

export function useAuth(): AuthContextType {
  const store = useAuthStore();
  
  const loading = store.status === "loading";

  const activeProfile =
    deriveActiveProfile(store.profiles, store.activeOrganizationId) ?? null;

  const role = activeProfile?.role ?? null;

  return {
    user: store.user,
    session: store.session,
    role,
    loading,
    signOut: async () => {
      const result = await store.signOut();
      if (!result.success) {
        toast.error(result.error ?? "Failed to sign out");
      }
    },
    refreshSession: store.refreshSession,
    hasRole: store.hasRole,
    activeOrganizationId: store.activeOrganizationId,
    hasMultipleOrganizations: store.hasMultipleOrganizations(),
    switchOrganization: async (organizationId) => {
      const result = await store.switchOrganization(organizationId);
      if (!result.success) {
        toast.error(result.error ?? "Failed to switch organization");
      }
    },
    mfaRequired: store.mfaRequired,
    mfaEnrolled: store.mfaEnrolled,
    challengeMFA: async () => {
      const result = await store.challengeMFA();
      if (!result.success) {
        toast.error(result.error ?? "Failed to start MFA challenge");
      }
    },
    verifyMFA: async (code) => {
      const result = await store.verifyMFA(code);
      if (!result.success) {
        toast.error(result.error ?? "Invalid verification code");
      }
    },
    enrollMFA: async () => {
      const result = await store.enrollMFA();
      if (!result.success) {
        toast.error(result.error ?? "Failed to start MFA enrollment");
      }
    },
    unenrollMFA: async () => {
      const result = await store.unenrollMFA();
      if (!result.success) {
        toast.error(result.error ?? "Failed to unenroll MFA");
      }
    },
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
