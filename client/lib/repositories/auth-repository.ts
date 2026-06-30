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
}
