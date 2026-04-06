import { UserRepository, type AnalystUser } from '@/lib/repositories/user-repository';

export interface GetUsersOptions {
  limit?: number;
  role?: "ANALYST" | "ADMINISTRATOR";
  isActive?: boolean;
  department?: string;
  search?: string;
}

export interface CreateUserOptions {
  full_name: string;
  role: "ANALYST" | "ADMINISTRATOR";
  department: string | null;
  is_active: boolean;
  email?: string;
}

export interface UpdateUserStatusOptions {
  isActive: boolean;
}

export interface UpdateUserRoleOptions {
  role: "ANALYST" | "ADMINISTRATOR";
}

export interface UserSubscriptionOptions {
  onNewUser?: (user: AnalystUser) => void;
  onUserUpdated?: (user: AnalystUser) => void;
  onUserDeleted?: (user: AnalystUser) => void;
  onError?: (error: Error) => void;
}

// ─── Service ───────────────────────────────────────────────────────────────────

export class UserService {
  private channelName: string | null = null;

  constructor(private readonly repository: UserRepository) { }

  // ── Queries ────────────────────────────────────────────────────────────────

  async getUsers(options: GetUsersOptions = {}): Promise<AnalystUser[]> {
    return this.repository.findUsers({
      ...options,
      orderBy: { column: 'created_at', ascending: false },
      limit: options.limit,
    });
  }

  async getUserById(id: string): Promise<AnalystUser | null> {
    return this.repository.getUserById(id);
  }

  async getUsersByRole(role: "ANALYST" | "ADMINISTRATOR"): Promise<AnalystUser[]> {
    return this.repository.getUsersByRole(role);
  }

  async getActiveUsers(): Promise<AnalystUser[]> {
    return this.repository.getActiveUsers();
  }

  async searchUsers(query: string, options: GetUsersOptions = {}): Promise<AnalystUser[]> {
    return this.repository.searchUsers(query, options);
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  async createUser(userData: CreateUserOptions): Promise<AnalystUser> {
    return this.repository.createUser(userData);
  }

  async updateUserStatus(
    id: string,
    options: UpdateUserStatusOptions
  ): Promise<AnalystUser> {
    return this.repository.updateUserStatus(id, options.isActive);
  }

  async updateUserRole(
    id: string,
    options: UpdateUserRoleOptions
  ): Promise<AnalystUser> {
    return this.repository.updateUserRole(id, options.role);
  }

  async deleteUser(id: string): Promise<void> {
    return this.repository.deleteUser(id);
  }

  // ── Realtime ───────────────────────────────────────────────────────────────

  subscribeToUsers(callbacks: UserSubscriptionOptions): void {
    if (this.channelName) {
      this.repository.unsubscribeFromUsers(this.channelName);
    }

    const repoCallbacks = {
      onInsert: (user: AnalystUser) => {
        callbacks.onNewUser?.(user);
      },
      onUpdate: (user: AnalystUser) => {
        callbacks.onUserUpdated?.(user);
      },
      onDelete: (user: AnalystUser) => {
        callbacks.onUserDeleted?.(user);
      },
      onError: (err: unknown) => {
        callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      },
    };

    this.channelName = this.repository.subscribeToUsers({}, repoCallbacks);
  }

  unsubscribeFromUsers(): void {
    if (this.channelName) {
      this.repository.unsubscribeFromUsers(this.channelName);
      this.channelName = null;
    }
  }
}
