import { UserRepository } from "@/lib/repositories/user-repository";
import { StorageRepository } from "@/lib/repositories/storage-repository";
import type { UserProfile } from "@/lib/types/user";
import type { Result } from "@/lib/types/shared";

export interface UserSubscriptionOptions {
  onNewUser?: (user: UserProfile) => void;
  onUserUpdated?: (user: UserProfile) => void;
  onUserDeleted?: (user: UserProfile) => void;
  onError?: (error: Error) => void;
}

export class UserService {
  private channelName: string | null = null;

  constructor(
    private readonly userRepo: UserRepository,
    private readonly storageRepo: StorageRepository,
  ) {}

  public async getUsers(options?: {
    search?: string;
    limit?: number;
  }): Promise<Result<UserProfile[]>> {
    const { data, error } = await this.userRepo.findUsers(options);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getUserById(id: string): Promise<Result<UserProfile>> {
    const { data, error } = await this.userRepo.getUserById(id);
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "User not found" };
    return { success: true, data };
  }

  public async createUser(
    userData: {
      id: string;
      full_name: string;
      username?: string;
      avatar_url?: string;
    },
  ): Promise<Result<UserProfile>> {
    const { data, error } = await this.userRepo.createUser(userData);
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Failed to create user" };
    return { success: true, data };
  }

  public async updateUser(
    id: string,
    data: Partial<Pick<UserProfile, "full_name" | "username" | "avatar_url">>,
  ): Promise<Result<UserProfile>> {
    const { data: user, error } = await this.userRepo.updateUser(id, data);
    if (error) return { success: false, error: error.message };
    if (!user) return { success: false, error: "User not found" };
    return { success: true, data: user };
  }

  public async deleteUser(id: string): Promise<Result<void>> {
    const { error } = await this.userRepo.deleteUser(id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }

  public async uploadAvatar(
    userId: string,
    file: File,
  ): Promise<Result<string>> {
    const path = `users/${userId}/avatar`;
    const { path: filePath, error: uploadError } = await this.storageRepo.uploadFile("avatars", path, file);
    if (uploadError) return { success: false, error: uploadError.message };
    if (!filePath) return { success: false, error: "Failed to upload avatar" };

    const avatarUrl = this.storageRepo.getPublicUrl("avatars", filePath);

    const { data: user, error: updateError } = await this.userRepo.updateUser(userId, {
      avatar_url: avatarUrl,
    });
    if (updateError) return { success: false, error: updateError.message };
    if (!user) return { success: false, error: "User not found" };

    return { success: true, data: avatarUrl };
  }

  public async deleteAvatar(userId: string): Promise<Result<void>> {
    const path = `users/${userId}/avatar`;
    const { error: deleteError } = await this.storageRepo.deleteFile("avatars", path);
    if (deleteError) return { success: false, error: deleteError.message };

    const { error: updateError } = await this.userRepo.updateUser(userId, {
      avatar_url: null,
    });
    if (updateError) return { success: false, error: updateError.message };

    return { success: true, data: undefined };
  }

  public subscribeToUsers(callbacks: UserSubscriptionOptions): void {
    if (this.channelName) {
      this.userRepo.unsubscribeFromUserChanges(this.channelName);
    }

    const repoCallbacks = {
      onInsert: (user: UserProfile) => callbacks.onNewUser?.(user),
      onUpdate: (user: UserProfile) => callbacks.onUserUpdated?.(user),
      onDelete: (user: UserProfile) => callbacks.onUserDeleted?.(user),
      onError: (err: Error) => callbacks.onError?.(err),
    };

    this.channelName = this.userRepo.subscribeToUserChanges(repoCallbacks);
  }

  public unsubscribeFromUsers(): void {
    if (this.channelName) {
      this.userRepo.unsubscribeFromUserChanges(this.channelName);
      this.channelName = null;
    }
  }
}
