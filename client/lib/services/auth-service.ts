import { AuthRepository } from "@/lib/repositories/auth-repository";
import type { Provider, User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import type { Result } from "@/lib/types/shared";

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  public async signIn(
    email: string,
    password: string,
    captchaToken?: string,
  ): Promise<Result<{ user: User; session: Session }>> {
    const result = await this.repository.signInWithPassword(email, password, captchaToken);
    if (result.error) return { success: false, error: result.error.message };
    if (!result.user || !result.session) {
      return { success: false, error: "No user returned" };
    }
    return {
      success: true,
      data: { user: result.user, session: result.session },
    };
  }

  public async getMFAFactors(): Promise<Result<{
    all: Array<{ id: string; factor_type: string; status: string; created_at: string; updated_at: string; friendly_name?: string; last_challenged_at?: string }>;
    totp: Array<{ id: string; factor_type: string; status: string; created_at: string; updated_at: string; friendly_name?: string; last_challenged_at?: string }>;
  }>> {
    const result = await this.repository.mfaListFactors();
    if (result.error) return { success: false, error: result.error.message };
    if (!result.data) return { success: false, error: "No factors returned" };
    return { success: true, data: result.data };
  }

  public async enrollMFA(): Promise<Result<{
    id: string;
    totp: { qr_code: string; secret: string; uri: string };
  }>> {
    const result = await this.repository.mfaEnroll();
    if (result.error) return { success: false, error: result.error.message };
    if (!result.data) return { success: false, error: "No enrollment data returned" };
    return { success: true, data: result.data };
  }

  public async challengeMFA(factorId: string): Promise<Result<{ id: string }>> {
    const result = await this.repository.mfaChallenge(factorId);
    if (result.error) return { success: false, error: result.error.message };
    if (!result.data) return { success: false, error: "No challenge data returned" };
    return { success: true, data: result.data };
  }

  public async verifyMFA(
    factorId: string,
    challengeId: string,
    code: string,
  ): Promise<Result<{ user: import("@supabase/supabase-js").User }>> {
    const result = await this.repository.mfaVerify(factorId, challengeId, code);
    if (result.error) return { success: false, error: result.error.message };
    if (!result.data) return { success: false, error: "No verification data returned" };
    return { success: true, data: result.data };
  }

  public async unenrollMFA(factorId: string): Promise<Result<void>> {
    const result = await this.repository.mfaUnenroll(factorId);
    if (result.error) return { success: false, error: result.error.message };
    return { success: true, data: undefined };
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
    redirectTo?: string,
    captchaToken?: string,
  ): Promise<Result<{ user: User | null; session: Session | null }>> {
    const result = await this.repository.signUp(email, password, fullName, redirectTo, captchaToken);
    if (result.error) return { success: false, error: result.error.message };
    return {
      success: true,
      data: { user: result.user, session: result.session },
    };
  }

  public async resetPassword(
    email: string,
    redirectTo?: string,
    captchaToken?: string,
  ): Promise<Result<void>> {
    const { error } = await this.repository.resetPassword(email, redirectTo, captchaToken);
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
