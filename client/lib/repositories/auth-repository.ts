import { BaseRepository } from '@/lib/repositories/base-repository';

export interface AuthUser {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  approval_status?: string;
  role?: string;
  is_active?: boolean;
  full_name?: string;
  department?: string;
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

  async getUserRole(userId: string): Promise<{ role: string | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabase
        .from("analyst_users")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      return {
        role: (data as unknown as { role: string | null })?.role ?? null,
        error: null
      };
    } catch (error) {
      return {
        role: null,
        error: error instanceof Error ? error : new Error('Failed to fetch user role')
      };
    }
  }

  async refreshSession(): Promise<{ user: AuthUser | null; error: Error | null }> {
    try {
      const { data: { session }, error } = await this.supabase.auth.refreshSession();
      if (error) throw error;
      return {
        user: session?.user as AuthUser || null,
        error: null
      };
    } catch (error) {
      return {
        user: null,
        error: error instanceof Error ? error : new Error('Failed to refresh session')
      };
    }
  }

  async getUserWithProfile(userId: string): Promise<{ user: AuthUser | null; error: Error | null }> {
    try {
      const { data: authUser, error: authError } = await this.supabase.auth.admin.getUserById(userId);
      if (authError) throw authError;

      const { data: profile, error: profileError } = await this.supabase
        .from('analyst_users')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') throw profileError;

      const combinedUser: AuthUser = {
        ...authUser.user,
        email: authUser.user.email || '',
        approval_status: profile?.approval_status,
        role: profile?.role,
        is_active: profile?.is_active,
        full_name: profile?.full_name,
        department: profile?.department,
      };

      return { user: combinedUser, error: null };
    } catch (error) {
      return {
        user: null,
        error: error instanceof Error ? error : new Error('Failed to fetch user profile')
      };
    }
  }

  async isUserApproved(userId: string): Promise<{ approved: boolean; error: Error | null }> {
    try {
      const { data, error } = await this.supabase
        .from('analyst_users')
        .select('approval_status, is_active')
        .eq('user_id', userId)
        .single();

      if (error) throw error;

      const approved = data?.approval_status === 'APPROVED' && data?.is_active === true;
      return { approved, error: null };
    } catch (error) {
      return {
        approved: false,
        error: error instanceof Error ? error : new Error('Failed to check approval status')
      };
    }
  }

  async getPendingUsers(): Promise<{ users: AuthUser[]; error: Error | null }> {
    try {
      const { data, error } = await this.supabase
        .from('pending_users')
        .select('*');

      if (error) throw error;

      const users: AuthUser[] = (data || []).map(user => ({
        id: user.user_id,
        email: user.auth_email,
        user_metadata: { department: user.auth_department },
        app_metadata: {},
        approval_status: 'PENDING',
        full_name: user.full_name,
        department: user.department,
      }));

      return { users, error: null };
    } catch (error) {
      return {
        users: [],
        error: error instanceof Error ? error : new Error('Failed to fetch pending users')
      };
    }
  }
}
