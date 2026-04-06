import { BaseRepository } from '@/lib/repositories/base-repository';

export interface AuthUser {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
}

export interface AuthResponse {
  user: AuthUser | null;
  error: Error | null;
}

export class AuthRepository extends BaseRepository {
  constructor() {
    super('auth');
  }

  async signOut(): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.auth.signOut();
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Failed to sign out') };
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser();
      if (error) throw error;
      return user as AuthUser;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getSession(): Promise<{ user: AuthUser | null; error: Error | null }> {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      if (error) throw error;
      return {
        user: session?.user as AuthUser || null,
        error: null
      };
    } catch (error) {
      return {
        user: null,
        error: error instanceof Error ? error : new Error('Failed to get session')
      };
    }
  }
}
