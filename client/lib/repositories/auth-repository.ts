import type {
  User,
  Session,
  AuthChangeEvent,
} from "@supabase/supabase-js";
import type { Provider, SupabaseClient } from "@supabase/supabase-js";

export class AuthRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async signInWithPassword(
    email: string,
    password: string,
    captchaToken?: string,
  ): Promise<{
    user: User | null;
    session: Session | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient.auth.signInWithPassword(
        {
          email,
          password,
          options: { captchaToken },
        },
      );
      if (error) throw error;
      return { user: data.user, session: data.session, error: null };
    } catch (error) {
      return {
        user: null,
        session: null,
        error: error instanceof Error ? error : new Error("Failed to sign in"),
      };
    }
  }

  public async signInWithOAuth(
    provider: Provider,
    options?: { redirectTo?: string },
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabaseClient.auth.signInWithOAuth({
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

  public async signUp(
    email: string,
    password: string,
    fullName: string,
    redirectTo?: string,
    captchaToken?: string,
  ): Promise<{
    user: User | null;
    session: Session | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: redirectTo,
          captchaToken,
        },
      });
      
      if (error) throw error;
      return { user: data.user, session: data.session, error: null };
    } catch (error) {
      return {
        user: null,
        session: null,
        error: error instanceof Error ? error : new Error("Failed to sign up"),
      };
    }
  }

  public async resetPassword(
    email: string,
    redirectTo?: string,
    captchaToken?: string,
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabaseClient.auth.resetPasswordForEmail(
        email,
        {
          redirectTo,
          captchaToken,
        },
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

  public async updateUserPassword(
    password: string,
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabaseClient.auth.updateUser({ password });
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

  public async signOut(): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabaseClient.auth.signOut();
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error : new Error("Failed to sign out"),
      };
    }
  }

  public async getSession(): Promise<{
    user: User | null;
    session: Session | null;
    error: Error | null;
  }> {
    const {
      data: { session },
      error,
    } = await this.supabaseClient.auth.getSession();
    if (error) return { user: null, session: null, error };
    return { user: session?.user ?? null, session, error: null };
  }

  public onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ): { data: { subscription: { unsubscribe: () => void } } } {
    return this.supabaseClient.auth.onAuthStateChange(callback);
  }

  public async mfaEnroll(): Promise<{
    data: { id: string; type: string; totp: { qr_code: string; secret: string; uri: string } } | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient.auth.mfa.enroll({
        factorType: "totp",
      });
      if (error) throw error;
      return { data: { ...data, totp: data.totp }, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to enroll MFA"),
      };
    }
  }

  public async mfaChallenge(factorId: string): Promise<{
    data: { id: string } | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient.auth.mfa.challenge({
        factorId,
      });
      if (error) throw error;
      return { data: { id: data.id }, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to create challenge"),
      };
    }
  }

  public async mfaVerify(
    factorId: string,
    challengeId: string,
    code: string,
  ): Promise<{ data: { user: import("@supabase/supabase-js").User } | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient.auth.mfa.verify({
        factorId,
        challengeId,
        code,
      });
      if (error) throw error;
      return { data: { user: data.user }, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to verify MFA code"),
      };
    }
  }

  public async mfaUnenroll(factorId: string): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabaseClient.auth.mfa.unenroll({
        factorId,
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error("Failed to unenroll MFA factor"),
      };
    }
  }

  public async mfaListFactors(): Promise<{
    data: {
      all: Array<{ id: string; factor_type: string; status: string; created_at: string; updated_at: string; friendly_name?: string; last_challenged_at?: string }>;
      totp: Array<{ id: string; factor_type: string; status: string; created_at: string; updated_at: string; friendly_name?: string; last_challenged_at?: string }>;
    } | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient.auth.mfa.listFactors();
      if (error) throw error;
      const mapFactor = (f: { id: string; factor_type: string; status: string; created_at: string; updated_at: string; friendly_name?: string; last_challenged_at?: string }) => ({
        id: f.id,
        factor_type: f.factor_type,
        status: f.status,
        created_at: f.created_at,
        updated_at: f.updated_at,
        friendly_name: f.friendly_name,
        last_challenged_at: f.last_challenged_at,
      });
      const all = (data.all ?? []).map(mapFactor);
      const totp = (data.totp ?? []).map(mapFactor);
      return { data: { all, totp }, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Failed to list MFA factors"),
      };
    }
  }
}
