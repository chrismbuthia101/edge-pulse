import { create } from "zustand";
import { AuthService } from "@/lib/services/auth-service";
import {
  AuthRepository,
  type AuthUser,
} from "@/lib/repositories/auth-repository";
import { User, Session } from "@supabase/supabase-js";
import { toast } from "sonner";

interface AuthStore {
  user: AuthUser | null;
  session: Session | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;

  initialize: () => Promise<void>;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;

  fetchUserRole: (userId: string) => Promise<string | null>;
  hasRole: (roles: string[]) => boolean;

  isAdmin: boolean;
  isAnalyst: boolean;

  clearSessionData: () => void;

  clearError: () => void;
  setError: (error: string) => void;
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

  // Computed properties
  get isAdmin() {
    const { role } = get();
    return role === "ORG_ADMIN" || role === "PLATFORM_ADMIN";
  },

  get isAnalyst() {
    const { role } = get();
    return role === "ORG_ANALYST";
  },

  initialize: async () => {
    if (get().initialized) {
      return;
    }

    try {
      set({ loading: true, error: null });

      const sessionResult = await authService.getSession();

      if (sessionResult.error) {
        console.error("Error getting session:", sessionResult.error);
        set({ loading: false, initialized: true });
        return;
      }

      const session = sessionResult.user
        ? {
            user: sessionResult.user as unknown as User,
            access_token: "",
            refresh_token: "",
            expires_in: 3600,
            token_type: "bearer" as const,
          }
        : null;

      set({ session, user: sessionResult.user });

      if (sessionResult.user) {
        const userProfile = await authRepository.getUserWithProfile(
          sessionResult.user.id,
        );
        if (userProfile.user) {
          set({
            user: userProfile.user,
            role: userProfile.user.role || null,
          });
        } else {
          // Fallback to role-only fetch if profile fetch fails
          const userRole = await get().fetchUserRole(sessionResult.user.id);
          set({ role: userRole });
        }
      } else {
        set({ role: null });
        get().clearSessionData();
      }
    } catch (error) {
      console.error("Error initializing auth:", error);
      set({
        error:
          error instanceof Error ? error.message : "Failed to initialize auth",
      });
    } finally {
      set({ loading: false, initialized: true });
    }
  },

  refreshSession: async () => {
    try {
      set({ loading: true, error: null });

      const refreshResult = await authService.refreshSession();

      if (refreshResult.error) {
        console.error("Error refreshing session:", refreshResult.error);
        set({ user: null, session: null, role: null });
        return;
      }

      const session = refreshResult.user
        ? {
            user: refreshResult.user as unknown as User,
            access_token: "",
            refresh_token: "",
            expires_in: 3600,
            token_type: "bearer" as const,
          }
        : null;

      set({ session, user: refreshResult.user });

      if (refreshResult.user) {
        const userProfile = await authRepository.getUserWithProfile(
          refreshResult.user.id,
        );
        if (userProfile.user) {
          set({
            user: userProfile.user,
            role: userProfile.user.role || null,
          });
        } else {
          const userRole = await get().fetchUserRole(refreshResult.user.id);
          set({ role: userRole });
        }
      } else {
        set({ role: null });
      }
    } catch (error) {
      console.error("Error refreshing session:", error);
      set({
        user: null,
        session: null,
        role: null,
        error:
          error instanceof Error ? error.message : "Failed to refresh session",
      });
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    try {
      await authService.signOut();
      get().clearSessionData();
      set({ user: null, session: null, role: null });
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

  clearSessionData: () => {
    try {
      document.cookie.split(";").forEach((c) => {
        const cookie = c.trim();
        if (cookie.length > 0) {
          const eqPos = cookie.indexOf("=");
          const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
          // Clear cookie for all paths and domains
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${window.location.hostname}`;
        }
      });
    } catch (error) {
      console.error("Error clearing session data:", error);
    }
  },

  resetInactivityTimer: () => {},

  clearError: () => set({ error: null }),

  setError: (error: string) => set({ error }),
}));

export { authService, authRepository };
