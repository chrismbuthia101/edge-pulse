import { BaseRepository } from '@/lib/repositories/base-repository';
import type { UserRow } from '@/lib/supabase/types/database';

export interface AuthUser {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  role?: string;
  account_status?: string;
  is_active?: boolean;
  full_name?: string;
}

export interface AuthResponse {
  user: AuthUser | null;
  error: Error | null;
}

export class AuthRepository extends BaseRepository {
  constructor() {
    super('users');
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
      return { user: session?.user as AuthUser || null, error: null };
    } catch (error) {
      return {
        user: null,
        error: error instanceof Error ? error : new Error('Failed to get session'),
      };
    }
  }

  async getUserRole(userId: string): Promise<{ role: string | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      return {
        role: (data as unknown as { role: string | null })?.role ?? null,
        error: null,
      };
    } catch (error) {
      return {
        role: null,
        error: error instanceof Error ? error : new Error('Failed to fetch user role'),
      };
    }
  }

  async refreshSession(): Promise<{ user: AuthUser | null; error: Error | null }> {
    try {
      const { data: { session }, error } = await this.supabase.auth.refreshSession();
      if (error) throw error;
      return { user: session?.user as AuthUser || null, error: null };
    } catch (error) {
      return {
        user: null,
        error: error instanceof Error ? error : new Error('Failed to refresh session'),
      };
    }
  }

  async getUserWithProfile(userId: string): Promise<{ user: AuthUser | null; error: Error | null }> {
    try {
      const { data: { user: authUser }, error: authError } = await this.supabase.auth.getUser();
      if (authError) throw authError;

      const { data: profile, error: profileError } = await this.supabase
        .from('users')
        .select('full_name, role, account_status')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') throw profileError;

      if (!authUser || authUser.id !== userId) {
        return {
          user: {
            id: userId,
            email: '',
            user_metadata: {},
            app_metadata: {},
            role: profile?.role,
            account_status: profile?.account_status,
            is_active: profile?.account_status === 'ACTIVE',
            full_name: profile?.full_name,
          },
          error: null,
        };
      }

      const combinedUser: AuthUser = {
        id: authUser.id,
        email: authUser.email || '',
        user_metadata: authUser.user_metadata || {},
        app_metadata: authUser.app_metadata || {},
        role: profile?.role,
        account_status: profile?.account_status,
        is_active: profile?.account_status === 'ACTIVE',
        full_name: profile?.full_name,
      };

      return { user: combinedUser, error: null };
    } catch (error) {
      return {
        user: null,
        error: error instanceof Error ? error : new Error('Failed to fetch user profile'),
      };
    }
  }

  async isUserApproved(userId: string): Promise<{ approved: boolean; error: Error | null }> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('account_status')
        .eq('id', userId)
        .single();

      if (error) throw error;

      const approved = data?.account_status === 'ACTIVE';
      return { approved, error: null };
    } catch (error) {
      return {
        approved: false,
        error: error instanceof Error ? error : new Error('Failed to check approval status'),
      };
    }
  }
}
