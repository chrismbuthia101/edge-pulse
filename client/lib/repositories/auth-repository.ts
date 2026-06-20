import { BaseRepository } from "@/lib/repositories/base-repository";
import type {
  UserRow,
  OrganizationRow,
} from "@/lib/supabase/types/database";
import type { UserRole, AccountStatus } from "@/lib/supabase/types/shared";
import type { User, Session } from "@supabase/supabase-js";
import type { Provider } from "@supabase/supabase-js";

export interface AuthUserProfile {
  organization_id: string | null;
  role: UserRole;
  account_status: AccountStatus;
  job_title: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: UserRole | null;
  account_status: AccountStatus | null;
  organization_id: string | null;
  profiles: AuthUserProfile[];
  activeOrganizationId: string | null;
}

export interface AuthResponse {
  user: AuthUser | null;
  error: Error | null;
}

function getActiveProfile(
  profiles: AuthUserProfile[],
  preferredOrgId?: string | null,
): AuthUserProfile | null {
  if (profiles.length === 0) return null;
  if (preferredOrgId) {
    const match = profiles.find((p) => p.organization_id === preferredOrgId);
    if (match) return match;
  }
  const active = profiles.find(
    (p) => p.account_status === "ACTIVE" && p.organization_id !== null,
  );
  if (active) return active;
  const platformAdmin = profiles.find((p) => p.organization_id === null);
  if (platformAdmin) return platformAdmin;
  return profiles[0];
}

export class AuthRepository extends BaseRepository<UserRow> {
  constructor() {
    super("users");
  }

  private async combineWithProfile(
    authUser: User | null,
  ): Promise<AuthUser | null> {
    if (!authUser) return null;

    let identity: Partial<UserRow> | null = null;
    let profiles: AuthUserProfile[] = [];

    try {
      const { data: userData } = await this.supabase
        .from("users")
        .select("full_name, username, avatar_url")
        .eq("id", authUser.id)
        .maybeSingle();
      identity = userData;
    } catch {
      // Identity query failed
    }

    try {
      const { data: profileData } = await this.supabase
        .from("organization_profiles")
        .select("organization_id, role, account_status, job_title")
        .eq("user_id", authUser.id);
      if (profileData) {
        profiles = profileData as AuthUserProfile[];
      }
    } catch {
      // Profiles query failed
    }

    const activeProfile = getActiveProfile(profiles);

    return {
      id: authUser.id,
      email: authUser.email || "",
      user_metadata: authUser.user_metadata || {},
      app_metadata: authUser.app_metadata || {},
      full_name: identity?.full_name ?? null,
      username: identity?.username ?? null,
      avatar_url: identity?.avatar_url ?? null,
      role: activeProfile?.role ?? null,
      account_status: activeProfile?.account_status ?? null,
      organization_id: activeProfile?.organization_id ?? null,
      profiles,
      activeOrganizationId: activeProfile?.organization_id ?? null,
    };
  }

  async signOut(): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.auth.signOut();
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error("Failed to sign out"),
      };
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const {
        data: { user },
        error,
      } = await this.supabase.auth.getUser();
      if (error) throw error;
      return this.combineWithProfile(user);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getSession(): Promise<{
    user: AuthUser | null;
    session: Session | null;
    error: Error | null;
  }> {
    try {
      const {
        data: { session },
        error,
      } = await this.supabase.auth.getSession();
      if (error) throw error;
      const user = session ? await this.combineWithProfile(session.user) : null;
      return { user, session: session ?? null, error: null };
    } catch (error) {
      return {
        user: null,
        session: null,
        error:
          error instanceof Error ? error : new Error("Failed to get session"),
      };
    }
  }

  async getUserRole(
    userId: string,
  ): Promise<{ role: string | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabase
        .from("organization_profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      return {
        role: (data as { role: string | null })?.role ?? null,
        error: null,
      };
    } catch (error) {
      return {
        role: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to fetch user role"),
      };
    }
  }

  async refreshSession(): Promise<{
    user: AuthUser | null;
    session: Session | null;
    error: Error | null;
  }> {
    try {
      const {
        data: { session },
        error,
      } = await this.supabase.auth.refreshSession();
      if (error) throw error;
      const user = session ? await this.combineWithProfile(session.user) : null;
      return { user, session: session ?? null, error: null };
    } catch (error) {
      return {
        user: null,
        session: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to refresh session"),
      };
    }
  }

  async getUserWithProfile(
    userId: string,
  ): Promise<{ user: AuthUser | null; error: Error | null }> {
    try {
      const {
        data: { user: authUser },
        error: authError,
      } = await this.supabase.auth.getUser();
      if (authError) throw authError;

      let identity: Partial<UserRow> | null = null;
      let profiles: AuthUserProfile[] = [];

      const { data: userData } = await this.supabase
        .from("users")
        .select("full_name, username, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      identity = userData;

      const { data: profileData } = await this.supabase
        .from("organization_profiles")
        .select("organization_id, role, account_status, job_title")
        .eq("user_id", userId);
      if (profileData) {
        profiles = profileData as AuthUserProfile[];
      }

      const activeProfile = getActiveProfile(profiles);

      const combinedUser: AuthUser = {
        id: userId,
        email: authUser?.email || "",
        user_metadata: authUser?.user_metadata || {},
        app_metadata: authUser?.app_metadata || {},
        full_name: identity?.full_name ?? null,
        username: identity?.username ?? null,
        avatar_url: identity?.avatar_url ?? null,
        role: activeProfile?.role ?? null,
        account_status: activeProfile?.account_status ?? null,
        organization_id: activeProfile?.organization_id ?? null,
        profiles,
        activeOrganizationId: activeProfile?.organization_id ?? null,
      };

      return { user: combinedUser, error: null };
    } catch (error) {
      return {
        user: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to fetch user profile"),
      };
    }
  }

  async isUserApproved(
    userId: string,
  ): Promise<{ approved: boolean; error: Error | null }> {
    try {
      const { data, error } = await this.supabase
        .from("organization_profiles")
        .select("account_status")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      const approved = data?.account_status === "ACTIVE";
      return { approved, error: null };
    } catch (error) {
      return {
        approved: false,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to check approval status"),
      };
    }
  }

  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<{
    user: AuthUser | null;
    session: Session | null;
    error: Error | null;
  }> {
    try {
      const { data, error } =
        await this.supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const user = data.user
        ? await this.combineWithProfile(data.user)
        : null;
      return { user, session: data.session, error: null };
    } catch (error) {
      return {
        user: null,
        session: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to sign in"),
      };
    }
  }

  async signInWithOAuth(
    provider: Provider,
    options?: { redirectTo?: string },
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: options?.redirectTo },
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error
            : new Error("Failed to sign in with OAuth"),
      };
    }
  }

  async signUp(
    email: string,
    password: string,
    fullName: string,
  ): Promise<{
    user: AuthUser | null;
    session: Session | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;
      const user = data.user
        ? await this.combineWithProfile(data.user)
        : null;
      return { user, session: data.session, error: null };
    } catch (error) {
      return {
        user: null,
        session: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to sign up"),
      };
    }
  }

  async resetPasswordForEmail(
    email: string,
    redirectTo?: string,
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo },
      );
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error
            : new Error("Failed to send password reset email"),
      };
    }
  }

  async updateUserPassword(
    password: string,
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.auth.updateUser({ password });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error
            : new Error("Failed to update password"),
      };
    }
  }

  async updateCurrentUser(
    data: Partial<{
      email: string;
      user_metadata: Record<string, unknown>;
      password: string;
    }>,
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.auth.updateUser(data);
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error
            : new Error("Failed to update current user"),
      };
    }
  }

  async findOrganizationsByIds(
    ids: string[],
  ): Promise<{ data: OrganizationRow[] | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabase
        .schema("organization")
        .from("organizations")
        .select("*")
        .in("id", ids);
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to fetch organizations"),
      };
    }
  }

  async updateUserProfile(
    userId: string,
    data: Partial<Pick<UserRow, "full_name" | "username" | "avatar_url">>,
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase
        .from("users")
        .update(data)
        .eq("id", userId);
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error
            : new Error("Failed to update profile"),
      };
    }
  }

  async activateProfile(
    userId: string,
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase
        .schema("organization")
        .from("profiles")
        .update({ account_status: "ACTIVE" })
        .eq("user_id", userId)
        .eq("account_status", "PENDING");
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error
            : new Error("Failed to activate profile"),
      };
    }
  }

  async getProfileStatus(
    userId: string,
  ): Promise<{
    account_status: AccountStatus | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabase
        .schema("organization")
        .from("profiles")
        .select("account_status")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return {
        account_status: (data as { account_status: AccountStatus } | null)
          ?.account_status ?? null,
        error: null,
      };
    } catch (error) {
      return {
        account_status: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get profile status"),
      };
    }
  }
}
