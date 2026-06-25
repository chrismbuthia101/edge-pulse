import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { User, Session, Provider } from "@supabase/supabase-js";
import { createClient } from "@/lib/config/client";
import { AuthService } from "@/lib/services/auth-service";
import { AuthRepository } from "@/lib/repositories/auth-repository";
import { UserService } from "@/lib/services/user-service";
import { UserRepository } from "@/lib/repositories/user-repository";
import { OrgProfileService } from "@/lib/services/org-profile-service";
import { OrgProfileRepository } from "@/lib/repositories/org-profile-repository";
import { StorageRepository } from "@/lib/repositories/storage-repository";
import type { OrganizationProfile, UserProfile } from "@/lib/types/user";
import type { AccountStatus } from "@/lib/types/shared";
import type { Result } from "@/lib/types/shared";

type AuthSubscription = {
  data: {
    subscription: {
      unsubscribe: () => void;
    };
  };
};

const supabase = createClient();
const authService = new AuthService(new AuthRepository(supabase));
const storageRepo = new StorageRepository(supabase);
const userService = new UserService(new UserRepository(supabase), storageRepo);
const orgProfileService = new OrgProfileService(
  new OrgProfileRepository(supabase),
);

export interface AuthUser extends User {
  profiles: OrganizationProfile[];
  full_name: string;
  username: string | null;
  avatar_url: string | null;
}

interface AuthState {
  user: AuthUser | null;
  session: Session | null;
  profiles: OrganizationProfile[];
  activeOrganizationId: string | null;
  __authSubscription?: AuthSubscription | null;
  status: "loading" | "authenticated" | "unauthenticated";
  loading: boolean;
  error: string | null;
  profileFetchFailed: boolean;
}

interface AuthActions {
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<Result<void>>;
  signInWithGoogle: (redirectTo?: string) => Promise<Result<void>>;
  signInWithOAuth: (
    provider: Provider,
    redirectTo?: string,
  ) => Promise<Result<void>>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    redirectTo?: string,
  ) => Promise<Result<void>>;
  resetPassword: (email: string, redirectTo?: string) => Promise<Result<void>>;
  updatePassword: (password: string) => Promise<Result<void>>;
  signOut: () => Promise<Result<void>>;
  updateProfile: (
    userId: string,
    data: { full_name?: string; username?: string; avatar_url?: string | null },
  ) => Promise<Result<void>>;
  activateProfile: (userId: string) => Promise<Result<void>>;
  getProfileStatus: (
    userId: string,
  ) => Promise<{ account_status: AccountStatus }>;
  switchOrganization: (organizationId: string) => Promise<Result<void>>;
  refreshSession: () => Promise<void>;
  hasRole: (roles: string[]) => boolean;
  hasMultipleOrganizations: () => boolean;
  clearError: () => void;
  setSession: (user: User | null, session: Session | null) => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  session: null,
  profiles: [],
  activeOrganizationId: null,
  __authSubscription: undefined,
  status: "loading",
  loading: false,
  error: null,
  profileFetchFailed: false,
};

async function fetchProfiles(userId: string): Promise<OrganizationProfile[]> {
  try {
    const result = await orgProfileService.getProfilesByUserId(userId);
    if (!result.success) {
      console.warn("Failed to fetch profiles:", result.error);
      useAuthStore.setState({ profileFetchFailed: true, error: result.error });
      return [];
    }
    useAuthStore.setState({ profileFetchFailed: false });
    return result.data;
  } catch (err) {
    console.warn("Failed to fetch profiles:", err);
    useAuthStore.setState({
      profileFetchFailed: true,
      error: err instanceof Error ? err.message : "Failed to fetch profiles",
    });
    return [];
  }
}

function enrichUser(
  user: User | null,
  profiles: OrganizationProfile[],
  userProfile: UserProfile | null,
): AuthUser | null {
  if (!user) return null;
  return {
    ...user,
    profiles,
    full_name: userProfile?.full_name ?? "",
    username: userProfile?.username ?? null,
    avatar_url: userProfile?.avatar_url ?? null,
  };
}

export function deriveActiveProfile(
  profiles: OrganizationProfile[],
  activeOrganizationId: string | null,
): OrganizationProfile | undefined {
  if (activeOrganizationId) {
    return profiles.find((p) => p.organization_id === activeOrganizationId);
  }
  return (
    profiles.find(
      (p) => p.account_status === "ACTIVE" && p.organization_id !== null,
    ) ?? profiles.find((p) => p.organization_id === null)
  );
}

export function resolvePostLoginRoute(
  profiles: OrganizationProfile[],
  activeOrganizationId: string | null,
  next?: string,
  profileFetchFailed?: boolean,
): string {
  if (profileFetchFailed && profiles.length === 0) {
    return "/auth/login?error=profile_fetch_failed";
  }

  const isSafeInternalRedirect =
    typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("://") &&
    !next.includes("\\");

  if (isSafeInternalRedirect && next !== "/dashboard") {
    return next;
  }

  if (profiles.some((p) => p.account_status === "PENDING")) {
    return "/onboarding/setup-profile";
  }

  const activeProfile = deriveActiveProfile(profiles, activeOrganizationId);
  const hasOrg = profiles.some((p) => p.organization_id !== null);

  if (activeProfile?.role === "PLATFORM_ADMIN") {
    return "/admin/overview";
  }

  const orgCount = profiles.filter((p) => p.organization_id !== null).length;

  if (orgCount > 1) {
    return "/onboarding/organizations";
  }

  if (!hasOrg) {
    return "/onboarding/setup-organization";
  }

  return "/dashboard";
}

export const useAuthStore = create<AuthStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      initialize: async () => {
        const sessionResult = await authService.getSession();
        if (!sessionResult.success) {
          set(
            {
              status: "unauthenticated",
              loading: false,
              user: null,
              session: null,
            },
            undefined,
            "auth/initialize/noSession",
          );
          return;
        }

        const { user: authUser, session } = sessionResult.data;
        const [profiles, userProfileResult] = await Promise.all([
          fetchProfiles(authUser.id),
          userService.getUserById(authUser.id),
        ]);
        const userProfile = userProfileResult.success
          ? userProfileResult.data
          : null;
        const user = enrichUser(authUser, profiles, userProfile);
        const activeProfile = deriveActiveProfile(profiles, null);

        set(
          {
            user,
            session,
            profiles,
            activeOrganizationId: activeProfile?.organization_id ?? null,
            status: "authenticated",
            loading: false,
          },
          undefined,
          "auth/initialize/success",
        );

        if (!get().__authSubscription) {
          const sub: AuthSubscription = authService.onAuthStateChange(
            (event, session) => {
              if (session?.user) {
                get()
                  .setSession(session?.user ?? null, session)
                  .catch(() => {});
              } else {
                set(
                  {
                    user: null,
                    session: null,
                    profiles: [],
                    activeOrganizationId: null,
                    status: "unauthenticated",
                    loading: false,
                    error: null,
                    profileFetchFailed: false,
                  },
                  undefined,
                  "auth/onAuthStateChange/signOut",
                );
              }
            },
          ) as AuthSubscription;
          set(
            { __authSubscription: sub },
            undefined,
            "auth/initialize/subscribed",
          );
        }
      },

      setSession: async (user, session) => {
        if (!user) {
          set(
            { ...initialState, status: "unauthenticated" },
            undefined,
            "auth/setSession/unauthenticated",
          );
          return;
        }

        const [profiles, userProfileResult] = await Promise.all([
          fetchProfiles(user.id),
          userService.getUserById(user.id),
        ]);
        const userProfile = userProfileResult.success
          ? userProfileResult.data
          : null;
        const enrichedUser = enrichUser(user, profiles, userProfile);
        const activeProfile = deriveActiveProfile(
          profiles,
          get().activeOrganizationId,
        );

        set(
          {
            user: enrichedUser,
            session,
            profiles,
            activeOrganizationId:
              activeProfile?.organization_id ?? get().activeOrganizationId,
            status: "authenticated",
            loading: false,
          },
          undefined,
          "auth/setSession/authenticated",
        );
      },

      clearError: () => set({ error: null }, undefined, "auth/clearError"),

      signIn: async (email, password) => {
        set(
          { status: "loading", loading: true, error: null },
          undefined,
          "auth/signIn/start",
        );
        const result = await authService.signIn(email, password);

        if (!result.success) {
          set(
            { status: "unauthenticated", loading: false, error: result.error },
            undefined,
            "auth/signIn/error",
          );
          return { success: false, error: result.error };
        }

        const { user: authUser, session } = result.data;
        const [profiles, userProfileResult] = await Promise.all([
          fetchProfiles(authUser.id),
          userService.getUserById(authUser.id),
        ]);
        const userProfile = userProfileResult.success
          ? userProfileResult.data
          : null;
        const user = enrichUser(authUser, profiles, userProfile);
        const activeProfile = deriveActiveProfile(profiles, null);

        set(
          {
            user,
            session,
            profiles,
            activeOrganizationId: activeProfile?.organization_id ?? null,
            status: "authenticated",
            loading: false,
            error: null,
          },
          undefined,
          "auth/signIn/success",
        );

        return { success: true, data: undefined };
      },

      signInWithGoogle: async (redirectTo) => {
        set(
          { status: "loading", loading: true, error: null },
          undefined,
          "auth/signInGoogle/start",
        );
        const result = await authService.signInWithGoogle(redirectTo);

        if (!result.success) {
          set(
            { status: "unauthenticated", loading: false, error: result.error },
            undefined,
            "auth/signInGoogle/error",
          );
        }

        return result;
      },

      signInWithOAuth: async (provider, redirectTo) => {
        set(
          { status: "loading", loading: true, error: null },
          undefined,
          "auth/signInOAuth/start",
        );
        const result = await authService.signInWithOAuth(provider, {
          redirectTo,
        });

        if (!result.success) {
          set(
            { status: "unauthenticated", loading: false, error: result.error },
            undefined,
            "auth/signInOAuth/error",
          );
        }

        return result.success
          ? { success: true, data: undefined }
          : { success: false, error: result.error };
      },

      signUp: async (email, password, fullName, redirectTo) => {
        set(
          { status: "loading", loading: true, error: null },
          undefined,
          "auth/signUp/start",
        );
        const result = await authService.signUp(email, password, fullName, redirectTo);

        if (!result.success) {
          set(
            { status: "unauthenticated", loading: false, error: result.error },
            undefined,
            "auth/signUp/error",
          );
          return { success: false, error: result.error };
        }

        const { user: authUser, session } = result.data;

        if (authUser && session) {
          const [profiles, userProfileResult] = await Promise.all([
            fetchProfiles(authUser.id),
            userService.getUserById(authUser.id),
          ]);
          const userProfile = userProfileResult.success
            ? userProfileResult.data
            : null;
          const user = enrichUser(authUser, profiles, userProfile);

          set(
            {
              user,
              session,
              profiles,
              status: "authenticated",
              loading: false,
              error: null,
            },
            undefined,
            "auth/signUp/success",
          );
        } else {
          set(
            {
              user: null,
              session: null,
              profiles: [],
              status: "unauthenticated",
              loading: false,
              error: null,
            },
            undefined,
            "auth/signUp/success-no-session",
          );
        }

        return { success: true, data: undefined };
      },

      resetPassword: async (email, redirectTo) => {
        set(
          { status: "loading", loading: true, error: null },
          undefined,
          "auth/resetPassword/start",
        );
        const result = await authService.resetPassword(email, redirectTo);

        set(
          {
            status: "unauthenticated",
            loading: false,
            error: result.success ? null : result.error,
          },
          undefined,
          "auth/resetPassword/done",
        );

        return result;
      },

      updatePassword: async (password) => {
        set(
          { status: "loading", loading: true, error: null },
          undefined,
          "auth/updatePassword/start",
        );
        const result = await authService.updatePassword(password);

        set(
          {
            status: "authenticated",
            loading: false,
            error: result.success ? null : result.error,
          },
          undefined,
          "auth/updatePassword/done",
        );

        return result;
      },

      signOut: async () => {
        set(
          { status: "loading", loading: true, error: null },
          undefined,
          "auth/signOut/start",
        );
        const result = await authService.signOut();

        if (!result.success) {
          set(
            { status: "authenticated", loading: false, error: result.error },
            undefined,
            "auth/signOut/error",
          );
          return result;
        }

        const sub = get().__authSubscription;
        try {
          sub?.data.subscription.unsubscribe();
        } catch {
          // ignore
        }

        set(
          {
            ...initialState,
            status: "unauthenticated",
            __authSubscription: undefined,
          },
          undefined,
          "auth/signOut/success",
        );

        return { success: true, data: undefined };
      },

      updateProfile: async (userId, data) => {
        const result = await userService.updateUser(userId, {
          full_name: data.full_name,
          username: data.username,
          avatar_url: data.avatar_url ?? undefined,
        });

        if (result.success) {
          const [profiles, userProfileResult] = await Promise.all([
            fetchProfiles(userId),
            userService.getUserById(userId),
          ]);
          const userProfile = userProfileResult.success
            ? userProfileResult.data
            : null;
          const currentUser = get().user;
          if (currentUser) {
            const user = enrichUser(currentUser, profiles, userProfile);
            set({ user, profiles }, undefined, "auth/updateProfile/success");
          }
        }

        return result.success
          ? { success: true, data: undefined }
          : { success: false, error: result.error };
      },

      activateProfile: async (userId) => {
        const result = await orgProfileService.activateProfile(userId);

        if (result.success) {
          const [profiles, userProfileResult] = await Promise.all([
            fetchProfiles(userId),
            userService.getUserById(userId),
          ]);
          const userProfile = userProfileResult.success
            ? userProfileResult.data
            : null;
          const currentUser = get().user;
          if (currentUser) {
            const user = enrichUser(currentUser, profiles, userProfile);
            set({ user, profiles }, undefined, "auth/activateProfile/success");
          }
        }

        return result.success
          ? { success: true, data: undefined }
          : { success: false, error: result.error };
      },

      getProfileStatus: async (userId) => {
        const result = await orgProfileService.getProfileStatus(userId);
        return result.success
          ? result.data
          : { account_status: "PENDING" as AccountStatus };
      },

      switchOrganization: async (organizationId) => {
        const currentUser = get().user;
        if (!currentUser) {
          return { success: false, error: "Not authenticated" };
        }

        const profile = currentUser.profiles.find(
          (p) => p.organization_id === organizationId,
        );

        if (profile) {
          set(
            { activeOrganizationId: organizationId },
            undefined,
            "auth/switchOrganization/success",
          );
          return { success: true, data: undefined };
        }

        const result = await orgProfileService.switchOrganization(
          currentUser.id,
          organizationId,
        );

        if (result.success) {
          set(
            { activeOrganizationId: organizationId },
            undefined,
            "auth/switchOrganization/success",
          );
          return { success: true, data: undefined };
        }

        return { success: false, error: result.error };
      },

      refreshSession: async () => {
        const sessionResult = await authService.getSession();
        if (!sessionResult.success) return;

        const { user: authUser, session } = sessionResult.data;
        const [profiles, userProfileResult] = await Promise.all([
          fetchProfiles(authUser.id),
          userService.getUserById(authUser.id),
        ]);
        const userProfile = userProfileResult.success
          ? userProfileResult.data
          : null;
        const user = enrichUser(authUser, profiles, userProfile);
        const activeProfile = deriveActiveProfile(
          profiles,
          get().activeOrganizationId,
        );

        set(
          {
            user,
            session,
            profiles,
            activeOrganizationId:
              activeProfile?.organization_id ?? get().activeOrganizationId,
            status: "authenticated",
            loading: false,
          },
          undefined,
          "auth/refreshSession/success",
        );
      },

      hasRole: (roles) => {
        const state = get();
        const profile = deriveActiveProfile(
          state.profiles,
          state.activeOrganizationId,
        );
        if (!profile?.role) return false;
        return roles.includes(profile.role);
      },

      hasMultipleOrganizations: () => {
        return (
          get().profiles.filter((p) => p.organization_id !== null).length > 1
        );
      },
    }),
    { name: "auth-store" },
  ),
);
