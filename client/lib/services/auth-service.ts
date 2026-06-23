import { AuthRepository } from "@/lib/repositories/auth-repository";
import type { Provider, User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import type { Result } from "@/lib/types/shared";

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  public async signIn(
    email: string,
    password: string,
  ): Promise<Result<{ user: User; session: Session }>> {
    const result = await this.repository.signInWithPassword(email, password);
    if (result.error) return { success: false, error: result.error.message };
    if (!result.user || !result.session) {
      return { success: false, error: "No user returned" };
    }
    return {
      success: true,
      data: { user: result.user, session: result.session },
    };
  }

  public async signInWithOAuth(
    provider: Provider,
    options?: { redirectTo?: string },
  ): Promise<Result<Session>> {
    const { error } = await this.repository.signInWithOAuth(provider, options);
    if (error) return { success: false, error: error.message };
    return { success: true, data: {} as Session };
  }

  public async signInWithGoogle(
    redirectTo?: string,
  ): Promise<Result<void>> {
    const { error } = await this.repository.signInWithOAuth("google", {
      redirectTo,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }

  public async signUp(
    email: string,
    password: string,
    fullName: string,
  ): Promise<Result<{ user: User; session: Session }>> {
    const result = await this.repository.signUp(email, password, fullName);
    if (result.error) return { success: false, error: result.error.message };
    if (!result.user || !result.session) {
      return { success: false, error: "No user returned" };
    }
    return {
      success: true,
      data: { user: result.user, session: result.session },
    };
  }

  public async resetPassword(
    email: string,
    redirectTo?: string,
  ): Promise<Result<void>> {
    const { error } = await this.repository.resetPassword(email, redirectTo);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }

  public async updatePassword(
    password: string,
  ): Promise<Result<void>> {
    const { error } = await this.repository.updateUserPassword(password);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }

  public async signOut(): Promise<Result<void>> {
    const { error } = await this.repository.signOut();
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }

  public async getSession(): Promise<
    Result<{ user: User; session: Session }>
  > {
    const result = await this.repository.getSession();
    if (result.error) return { success: false, error: result.error.message };
    if (!result.session || !result.user) {
      return { success: false, error: "No session" };
    }
    return {
      success: true,
      data: { user: result.user, session: result.session },
    };
  }

  public onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ): { data: { subscription: { unsubscribe: () => void } } } {
    return this.repository.onAuthStateChange(callback);
  }
}
