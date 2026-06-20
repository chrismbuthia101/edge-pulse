import {
  AuthRepository,
  type AuthUser,
} from "@/lib/repositories/auth-repository";
import type { OrganizationRow } from "@/lib/supabase/types/database";
import type { Session, Provider } from "@supabase/supabase-js";

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async signOut(): Promise<{ success: boolean; error: string | null }> {
    const result = await this.repository.signOut();
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true, error: null };
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    return this.repository.getCurrentUser();
  }

  async getSession(): Promise<{
    user: AuthUser | null;
    session: Session | null;
    error: string | null;
  }> {
    const result = await this.repository.getSession();
    if (result.error) {
      return { user: null, session: null, error: result.error.message };
    }
    return { user: result.user, session: result.session, error: null };
  }

  async getUserRole(
    userId: string,
  ): Promise<{ role: string | null; error: string | null }> {
    const result = await this.repository.getUserRole(userId);
    if (result.error) {
      return { role: null, error: result.error.message };
    }
    return { role: result.role, error: null };
  }

  async refreshSession(): Promise<{
    user: AuthUser | null;
    session: Session | null;
    error: string | null;
  }> {
    const result = await this.repository.refreshSession();
    if (result.error) {
      return { user: null, session: null, error: result.error.message };
    }
    return { user: result.user, session: result.session, error: null };
  }

  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<{
    user: AuthUser | null;
    session: Session | null;
    error: string | null;
  }> {
    const result = await this.repository.signInWithPassword(email, password);
    if (result.error) {
      return { user: null, session: null, error: result.error.message };
    }
    return { user: result.user, session: result.session, error: null };
  }

  async signInWithOAuth(
    provider: Provider,
    options?: { redirectTo?: string },
  ): Promise<{ error: string | null }> {
    const result = await this.repository.signInWithOAuth(provider, options);
    if (result.error) {
      return { error: result.error.message };
    }
    return { error: null };
  }

  async signUp(
    email: string,
    password: string,
    fullName: string,
  ): Promise<{
    user: AuthUser | null;
    session: Session | null;
    error: string | null;
  }> {
    const result = await this.repository.signUp(email, password, fullName);
    if (result.error) {
      return { user: null, session: null, error: result.error.message };
    }
    return { user: result.user, session: result.session, error: null };
  }

  async resetPasswordForEmail(
    email: string,
    redirectTo?: string,
  ): Promise<{ success: boolean; error: string | null }> {
    const result = await this.repository.resetPasswordForEmail(
      email,
      redirectTo,
    );
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true, error: null };
  }

  async updateUserPassword(
    password: string,
  ): Promise<{ success: boolean; error: string | null }> {
    const result = await this.repository.updateUserPassword(password);
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true, error: null };
  }

  async updateCurrentUser(
    data: Partial<{
      email: string;
      user_metadata: Record<string, unknown>;
      password: string;
    }>,
  ): Promise<{ success: boolean; error: string | null }> {
    const result = await this.repository.updateCurrentUser(data);
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true, error: null };
  }

  async findOrganizationsByIds(
    ids: string[],
  ): Promise<{ data: OrganizationRow[] | null; error: string | null }> {
    const result = await this.repository.findOrganizationsByIds(ids);
    if (result.error) {
      return { data: null, error: result.error.message };
    }
    return { data: result.data, error: null };
  }

  async updateUserProfile(
    userId: string,
    data: Parameters<AuthRepository["updateUserProfile"]>[1],
  ): Promise<{ success: boolean; error: string | null }> {
    const result = await this.repository.updateUserProfile(userId, data);
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true, error: null };
  }

  async activateProfile(
    userId: string,
  ): Promise<{ success: boolean; error: string | null }> {
    const result = await this.repository.activateProfile(userId);
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true, error: null };
  }

  async getProfileStatus(
    userId: string,
  ): Promise<{
    account_status: string | null;
    error: string | null;
  }> {
    const result = await this.repository.getProfileStatus(userId);
    if (result.error) {
      return { account_status: null, error: result.error.message };
    }
    return { account_status: result.account_status, error: null };
  }
}

export const authService = new AuthService(new AuthRepository());
