import {
  UserRepository,
  type UserWithProfile,
} from "@/lib/repositories/user-repository";
import type { UserRole } from "@/lib/supabase/types";

export type { UserWithProfile } from "@/lib/repositories/user-repository";

export interface GetUsersOptions {
  limit?: number;
  role?: UserRole | UserRole[];
  isActive?: boolean;
  search?: string;
}

export interface CreateUserOptions {
  full_name: string;
  role: UserRole;
}

export interface UpdateUserStatusOptions {
  isActive: boolean;
}

export interface UpdateUserRoleOptions {
  role: UserRole;
}

export interface UserSubscriptionOptions {
  onNewUser?: (user: UserWithProfile) => void;
  onUserUpdated?: (user: UserWithProfile) => void;
  onUserDeleted?: (user: UserWithProfile) => void;
  onError?: (error: Error) => void;
}

export class UserService {
  private channelName: string | null = null;

  constructor(private readonly repository: UserRepository) {}

  async getUsers(options: GetUsersOptions = {}): Promise<UserWithProfile[]> {
    return this.repository.findUsers({
      ...options,
      orderBy: { column: "created_at", ascending: false },
      limit: options.limit,
    });
  }

  async getUserById(id: string): Promise<UserWithProfile | null> {
    return this.repository.getUserById(id);
  }

  async getUsersByRole(role: UserRole): Promise<UserWithProfile[]> {
    return this.repository.getUsersByRole(role);
  }

  async getActiveUsers(): Promise<UserWithProfile[]> {
    return this.repository.getActiveUsers();
  }

  async searchUsers(
    query: string,
    options: GetUsersOptions = {},
  ): Promise<UserWithProfile[]> {
    return this.repository.searchUsers(query, options);
  }

  async createUser(userData: CreateUserOptions): Promise<UserWithProfile> {
    return this.repository.createUser({
      full_name: userData.full_name,
      role: userData.role,
    });
  }

  async updateUserStatus(
    id: string,
    options: UpdateUserStatusOptions,
  ): Promise<UserWithProfile> {
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
      onInsert: (user: UserWithProfile) => {
        callbacks.onNewUser?.(user);
      },
      onUpdate: (user: UserWithProfile) => {
        callbacks.onUserUpdated?.(user);
      },
      onDelete: (user: UserWithProfile) => {
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
