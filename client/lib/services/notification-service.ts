import { NotificationRepository } from "@/lib/repositories/notification-repository";
import type {
  NotificationQueryOptions,
  PaginatedResult,
} from "@/lib/repositories/notification-repository";
import type { Notification } from "@/lib/types/notifications";
import type { Result } from "@/lib/types/shared";

export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  public async findNotifications(
    options: NotificationQueryOptions = {},
  ): Promise<Result<Notification[]>> {
    const { data, error } = await this.repository.findNotifications(options);
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  }

  public async findNotificationsPaginated(
    options: NotificationQueryOptions & { page: number; limit: number },
  ): Promise<Result<PaginatedResult<Notification>>> {
    const { data, error } =
      await this.repository.findNotificationsPaginated(options);
    if (error || !data) {
      return { success: false, error: error?.message ?? "No data returned" };
    }
    return { success: true, data };
  }

  public async getUnreadNotifications(
    userId: string,
    organizationId: string,
  ): Promise<Result<Notification[]>> {
    const { data, error } = await this.repository.getUnreadNotifications(
      userId,
      organizationId,
    );
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  }

  public async getUnreadCount(
    userId: string,
    organizationId: string,
  ): Promise<Result<number>> {
    const { data, error } = await this.repository.getUnreadCount(
      userId,
      organizationId,
    );
    if (error || data === null) {
      return { success: false, error: error?.message ?? "No data returned" };
    }
    return { success: true, data };
  }

  public async markAsRead(id: string): Promise<Result<Notification>> {
    const { data, error } = await this.repository.markAsRead(id);
    if (error || !data) {
      return { success: false, error: error?.message ?? "No data returned" };
    }
    return { success: true, data };
  }

  public async markAllAsRead(
    userId: string,
    organizationId: string,
  ): Promise<Result<void>> {
    const { error } = await this.repository.markAllAsRead(
      userId,
      organizationId,
    );
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }
}

import { createClient } from "@/lib/config/client";
export const notificationService = new NotificationService(
  new NotificationRepository(createClient()),
);
