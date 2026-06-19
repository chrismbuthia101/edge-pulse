import {
  UserRepository,
  type AnalystUser,
} from "@/lib/repositories/user-repository";
import type { UserRole } from "@/lib/supabase/types";

export interface GetUsersOptions {
  limit?: number;
  role?: UserRole | UserRole[];
  isActive?: boolean;
  search?: string;
}

export interface CreateUserOptions {
  full_name: string;
  role: UserRole;
  account_status: "ACTIVE" | "PENDING";
}

export interface UpdateUserStatusOptions {
  isActive: boolean;
}

export interface UpdateUserRoleOptions {
  role: UserRole;
}

export interface UserSubscriptionOptions {
  onNewUser?: (user: AnalystUser) => void;
  onUserUpdated?: (user: AnalystUser) => void;
  onUserDeleted?: (user: AnalystUser) => void;
  onError?: (error: Error) => void;
}

export class UserService {
  private channelName: string | null = null;

  constructor(private readonly repository: UserRepository) {}

  async getUsers(options: GetUsersOptions = {}): Promise<AnalystUser[]> {
    return this.repository.findUsers({
      ...options,
      orderBy: { column: "created_at", ascending: false },
      limit: options.limit,
    });
  }

  async getUserById(id: string): Promise<AnalystUser | null> {
    return this.repository.getUserById(id);
  }

  async getUsersByRole(role: UserRole): Promise<AnalystUser[]> {
    return this.repository.getUsersByRole(role);
  }

  async getActiveUsers(): Promise<AnalystUser[]> {
    return this.repository.getActiveUsers();
  }

  async searchUsers(
    query: string,
    options: GetUsersOptions = {},
  ): Promise<AnalystUser[]> {
    return this.repository.searchUsers(query, options);
  }

  async createUser(userData: CreateUserOptions): Promise<AnalystUser> {
    return this.repository.createUser({
      full_name: userData.full_name,
      role: userData.role,
      account_status: userData.account_status,
    });
  }

  async updateUserStatus(
    id: string,
    options: UpdateUserStatusOptions,
  ): Promise<AnalystUser> {
    return this.repository.updateUserStatus(
      id,
      options.isActive ? "ACTIVE" : "SUSPENDED",
    );
  }

  async deleteUser(id: string): Promise<void> {
    return this.repository.deleteUser(id);
  }

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
        callbacks.onError?.(
          err instanceof Error ? err : new Error(String(err)),
        );
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
