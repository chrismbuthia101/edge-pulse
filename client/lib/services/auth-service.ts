import { AuthRepository, type AuthUser } from '@/lib/repositories/auth-repository';

export class AuthService {
  constructor(private readonly repository: AuthRepository) { }

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

  async getSession(): Promise<{ user: AuthUser | null; error: string | null }> {
    const result = await this.repository.getSession();
    if (result.error) {
      return { user: null, error: result.error.message };
    }
    return { user: result.user, error: null };
  }

  async getUserRole(userId: string): Promise<{ role: string | null; error: string | null }> {
    const result = await this.repository.getUserRole(userId);
    if (result.error) {
      return { role: null, error: result.error.message };
    }
    return { role: result.role, error: null };
  }

  async refreshSession(): Promise<{ user: AuthUser | null; error: string | null }> {
    const result = await this.repository.refreshSession();
    if (result.error) {
      return { user: null, error: result.error.message };
    }
    return { user: result.user, error: null };
  }
}

export const authService = new AuthService(new AuthRepository());
