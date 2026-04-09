import { create } from 'zustand';
import { AuthService } from '@/lib/services/auth-service';
import { AuthRepository, type AuthUser } from '@/lib/repositories/auth-repository';
import { User, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

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

  resetInactivityTimer: () => void;
  clearSessionData: () => void;

  clearError: () => void;
  setError: (error: string) => void;
}

const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 hour in milliseconds
const WARNING_TIMEOUT = 5 * 60 * 1000; // 5 minutes before logout
const LAST_ACTIVITY_KEY = 'edgepulse_last_activity';
const SESSION_START_KEY = 'edgepulse_session_start';

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
    return role === "ADMINISTRATOR";
  },

  get isAnalyst() {
    const { role } = get();

    return !role || role === "ANALYST" || role === "ADMINISTRATOR";
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

      const session = sessionResult.user ? {
        user: sessionResult.user as unknown as User,
        access_token: '',
        refresh_token: '',
        expires_in: 3600,
        token_type: 'bearer' as const
      } : null;

      set({ session, user: sessionResult.user });

      if (sessionResult.user) {
        const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
        const now = Date.now();

        if (lastActivity) {
          const elapsed = now - parseInt(lastActivity, 10);

          if (elapsed >= INACTIVITY_TIMEOUT) {
            console.log("Session expired due to inactivity");
            await get().signOut();
            return;
          }
        } else {
          localStorage.setItem(SESSION_START_KEY, now.toString());
          localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());
        }

        const userProfile = await authRepository.getUserWithProfile(sessionResult.user.id);
        if (userProfile.user) {
          set({
            user: userProfile.user,
            role: userProfile.user.role || null
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
      set({ error: error instanceof Error ? error.message : 'Failed to initialize auth' });
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

      const session = refreshResult.user ? {
        user: refreshResult.user as unknown as User,
        access_token: '',
        refresh_token: '',
        expires_in: 3600,
        token_type: 'bearer' as const
      } : null;

      set({ session, user: refreshResult.user });

      if (refreshResult.user) {
        const userProfile = await authRepository.getUserWithProfile(refreshResult.user.id);
        if (userProfile.user) {
          set({
            user: userProfile.user,
            role: userProfile.user.role || null
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
      set({ user: null, session: null, role: null, error: error instanceof Error ? error.message : 'Failed to refresh session' });
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
      set({ error: error instanceof Error ? error.message : 'Failed to sign out' });
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
    // Default to ANALYST role if no role is assigned to ensure access
    const userRole = role || 'ANALYST';
    return roles.includes(userRole);
  },

  clearSessionData: () => {
    try {
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      localStorage.removeItem(SESSION_START_KEY);

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

  resetInactivityTimer: () => {
    const { user } = get();

    if (user) {
      const now = Date.now();

      localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());

      setTimeout(() => {
        toast.warning("You will be logged out due to inactivity in 5 minutes", {
          duration: 10000,
          action: {
            label: "Stay Logged In",
            onClick: () => get().resetInactivityTimer(),
          },
        });
      }, INACTIVITY_TIMEOUT - WARNING_TIMEOUT);

      setTimeout(() => {
        toast.error("You have been logged out due to inactivity");
        get().signOut();
      }, INACTIVITY_TIMEOUT);
    }
  },

  clearError: () => set({ error: null }),

  setError: (error: string) => set({ error }),
}));

export { authService, authRepository };
