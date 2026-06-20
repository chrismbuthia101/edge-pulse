import { create } from "zustand";
import { AuthService } from "@/lib/services/auth-service";
import {
  AuthRepository,
  type AuthUser,
} from "@/lib/repositories/auth-repository";
import type { OrganizationRow } from "@/lib/supabase/types/database";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";

const ACTIVE_ORG_KEY = "edgepulse_active_org";

function getStoredActiveOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    return null;
  }
}

function storeActiveOrgId(orgId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (orgId) {
      localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    } else {
      localStorage.removeItem(ACTIVE_ORG_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

interface AuthStore {
  user: AuthUser | null;
  session: Session | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  activeOrganizationId: string | null;

  initialize: () => Promise<void>;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;

  loadUserSession: (
    fetchFn: () => Promise<{
      user: AuthUser | null;
      session: Session | null;
      error: string | null;
    }>,
  ) => Promise<void>;
  fetchUserRole: (userId: string) => Promise<string | null>;
  hasRole: (roles: string[]) => boolean;
  switchOrganization: (organizationId: string) => Promise<void>;
  hasMultipleOrganizations: () => boolean;

  clearSessionData: () => void;

  clearError: () => void;
  setError: (error: string) => void;

  // Auth actions
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: (
    redirectTo?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (
    email: string,
  ) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (
    userId: string,
    data: Parameters<AuthService["updateUserProfile"]>[1],
  ) => Promise<{ success: boolean; error?: string }>;
  activateProfile: (
    userId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  getProfileStatus: (
    userId: string,
  ) => Promise<{ account_status: string | null; error?: string }>;
}

const authRepository = new AuthRepository();
const authService = new AuthService(authRepository);

export const useAuthStore = create<AuthStore>((set, get) => ({
  // Initial state
  user: null,
  session: null,
  role: null,
  loading: true,
  error: null,
  initialized: false,
  activeOrganizationId: null,

  initialize: async () => {
    if (get().initialized) return;
    await get().loadUserSession(async () => authService.getSession());
    set({ initialized: true });
  },

  refreshSession: async () => {
    await get().loadUserSession(async () => authService.refreshSession());
  },

  loadUserSession: async (
    fetchFn: () => Promise<{
      user: AuthUser | null;
      session: Session | null;
      error: string | null;
    }>,
  ) => {
    try {
      set({ loading: true, error: null });

      const result = await fetchFn();

      if (result.error) {
        console.error("Session error:", result.error);
        set({ user: null, session: null, role: null, activeOrganizationId: null });
        return;
      }

      let activeOrgId = result.user?.activeOrganizationId ?? null;
      const storedOrgId = getStoredActiveOrgId();

      if (storedOrgId && result.user?.profiles.some((p) => p.organization_id === storedOrgId)) {
        activeOrgId = storedOrgId;
      }

      const activeProfile = activeOrgId
        ? result.user?.profiles.find((p) => p.organization_id === activeOrgId) ?? null
        : result.user?.profiles.find(
            (p) => p.account_status === "ACTIVE" && p.organization_id !== null,
          ) ?? result.user?.profiles.find((p) => p.organization_id === null) ?? null;

      set({
        session: result.session,
        user: result.user,
        role: activeProfile?.role ?? null,
        activeOrganizationId: activeProfile?.organization_id ?? null,
      });

      if (result.user && !result.user.activeOrganizationId) {
        get().clearSessionData();
      }
    } catch (error) {
      console.error("Session error:", error);
      set({
        user: null,
        session: null,
        role: null,
        activeOrganizationId: null,
        error: error instanceof Error ? error.message : "Session error",
      });
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    try {
      await authService.signOut();
      get().clearSessionData();
      storeActiveOrgId(null);
      set({ user: null, session: null, role: null, activeOrganizationId: null });
      toast.success("Signed out successfully");

      window.location.href = "/auth/login";
    } catch (error) {
      console.error("Error signing out:", error);
      set({
        error: error instanceof Error ? error.message : "Failed to sign out",
      });
      toast.error("Error signing out");
    }
  },

  fetchUserRole: async (userId: string): Promise<string | null> => {
    try {
      const result = await authService.getUserRole(userId);
      if (result.error) {
        console.error("Error fetching user role:", result.error);
        return null;
      }
      return result.role;
    } catch (error) {
      console.error("Error fetching user role:", error);
      return null;
    }
  },

  hasRole: (roles: string[]): boolean => {
    const { role } = get();
    if (!role) return false;
    return roles.includes(role);
  },

  hasMultipleOrganizations: (): boolean => {
    const { user } = get();
    if (!user) return false;
    const orgProfiles = user.profiles.filter((p) => p.organization_id !== null);
    return orgProfiles.length > 1;
  },

  switchOrganization: async (organizationId: string) => {
    const { user } = get();
    if (!user) return;

    const profile = user.profiles.find(
      (p) => p.organization_id === organizationId,
    );
    if (!profile) {
      toast.error("You don't have access to this organization");
      return;
    }

    storeActiveOrgId(organizationId);

    set({
      role: profile.role,
      activeOrganizationId: profile.organization_id,
      user: {
        ...user,
        role: profile.role,
        account_status: profile.account_status,
        organization_id: profile.organization_id,
        activeOrganizationId: profile.organization_id,
      },
    });

    window.location.href = "/dashboard";
  },

  clearSessionData: () => {
    try {
      document.cookie.split(";").forEach((c) => {
        const cookie = c.trim();
        if (cookie.length > 0) {
          const eqPos = cookie.indexOf("=");
          const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${window.location.hostname}`;
        }
      });
    } catch (error) {
      console.error("Error clearing session data:", error);
    }
  },

  clearError: () => set({ error: null }),

  setError: (error: string) => set({ error }),

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const result = await authService.signInWithPassword(email, password);
      if (result.error) {
        set({ loading: false, error: result.error });
        return { success: false, error: result.error };
      }
      if (result.user) {
        set({
          user: result.user,
          session: result.session,
          role: result.user.role,
          activeOrganizationId: result.user.activeOrganizationId,
        });
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign in";
      set({ error: message });
      return { success: false, error: message };
    } finally {
      set({ loading: false });
    }
  },

  signInWithGoogle: async (redirectTo) => {
    set({ loading: true, error: null });
    try {
      const result = await authService.signInWithOAuth("google", {
        redirectTo: redirectTo ?? `${window.location.origin}/auth/callback`,
      });
      if (result.error) {
        set({ loading: false, error: result.error });
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign in with Google";
      set({ error: message });
      return { success: false, error: message };
    } finally {
      set({ loading: false });
    }
  },

  signUp: async (email, password, fullName) => {
    set({ loading: true, error: null });
    try {
      const result = await authService.signUp(email, password, fullName);
      if (result.error) {
        set({ loading: false, error: result.error });
        return { success: false, error: result.error };
      }
      if (result.user) {
        set({
          user: result.user,
          session: result.session,
          role: result.user.role,
          activeOrganizationId: result.user.activeOrganizationId,
        });
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign up";
      set({ error: message });
      return { success: false, error: message };
    } finally {
      set({ loading: false });
    }
  },

  resetPassword: async (email) => {
    set({ loading: true, error: null });
    try {
      const redirectTo = `${window.location.origin}/auth/reset-password`;
      const result = await authService.resetPasswordForEmail(email, redirectTo);
      if (result.error) {
        set({ loading: false, error: result.error });
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send reset email";
      set({ error: message });
      return { success: false, error: message };
    } finally {
      set({ loading: false });
    }
  },

  updatePassword: async (password) => {
    set({ loading: true, error: null });
    try {
      const result = await authService.updateUserPassword(password);
      if (result.error) {
        set({ loading: false, error: result.error });
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update password";
      set({ error: message });
      return { success: false, error: message };
    } finally {
      set({ loading: false });
    }
  },

  updateProfile: async (userId, data) => {
    set({ loading: true, error: null });
    try {
      const result = await authService.updateUserProfile(userId, data);
      if (result.error) {
        set({ loading: false, error: result.error });
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update profile";
      set({ error: message });
      return { success: false, error: message };
    } finally {
      set({ loading: false });
    }
  },

  activateProfile: async (userId) => {
    set({ loading: true, error: null });
    try {
      const result = await authService.activateProfile(userId);
      if (result.error) {
        set({ loading: false, error: result.error });
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to activate profile";
      set({ error: message });
      return { success: false, error: message };
    } finally {
      set({ loading: false });
    }
  },

  getProfileStatus: async (userId) => {
    try {
      const result = await authService.getProfileStatus(userId);
      if (result.error) {
        return { account_status: null, error: result.error };
      }
      return { account_status: result.account_status };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to get profile status";
      return { account_status: null, error: message };
    }
  },
}));

export { authService, authRepository };
