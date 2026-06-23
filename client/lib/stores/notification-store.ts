import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NotificationService } from "@/lib/services/notification-service";
import { NotificationRepository } from "@/lib/repositories/notification-repository";
import { createClient } from "@/lib/config/client";
import { errorMessage } from "@/lib/utils/error";
import type { Notification } from "@/lib/types/notifications";
import type {
  NotificationQueryOptions,
  PaginatedResult,
} from "@/lib/repositories/notification-repository";
import type { Result } from "@/lib/types/shared";

type Status = "idle" | "loading" | "success" | "error";

let notificationService: NotificationService | null = null;
function getNotificationService(): NotificationService {
  if (!notificationService) {
    notificationService = new NotificationService(
      new NotificationRepository(createClient()),
    );
  }
  return notificationService;
}

const initialState = {
  notifications: [] as Notification[],
  paginated: null as PaginatedResult<Notification> | null,
  unreadCount: 0,
  status: "idle" as Status,
  error: null as string | null,
};

type NotificationStore = typeof initialState & {
  initialize: (supabaseClient: SupabaseClient) => void;
  fetchNotifications: (options?: NotificationQueryOptions) => Promise<void>;
  fetchPaginated: (
    options: NotificationQueryOptions & { page: number; limit: number },
  ) => Promise<Result<PaginatedResult<Notification>> | undefined>;
  fetchUnreadCount: (userId: string, organizationId: string) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: (userId: string, organizationId: string) => Promise<void>;
  clearError: () => void;
};

export const useNotificationStore = create<NotificationStore>()(
  devtools(
    (set) => ({
      ...initialState,

      initialize: (supabaseClient: SupabaseClient) => {
        notificationService = new NotificationService(
          new NotificationRepository(supabaseClient),
        );
      },

      fetchNotifications: async (options) => {
        set({ status: "loading" });
        const result =
          await getNotificationService().findNotifications(options);
        if (!result.success) {
          set({ status: "error", error: result.error });
          return;
        }
        set({ notifications: result.data, status: "success" });
      },

      fetchPaginated: async (options) => {
        set({ status: "loading" });
        const result =
          await getNotificationService().findNotificationsPaginated(options);
        if (!result.success) {
          set({ status: "error", error: result.error });
          return result;
        }
        set({ paginated: result.data, status: "success" });
        return result;
      },

      fetchUnreadCount: async (userId, organizationId) => {
        const result = await getNotificationService().getUnreadCount(
          userId,
          organizationId,
        );
        if (!result.success) {
          set({ status: "error", error: errorMessage(result.error) });
          return;
        }
        set({ unreadCount: result.data });
      },

      markAsRead: async (id) => {
        const result = await getNotificationService().markAsRead(id);
        if (!result.success) {
          set({ status: "error", error: result.error });
        }
      },

      markAllAsRead: async (userId, organizationId) => {
        const result = await getNotificationService().markAllAsRead(
          userId,
          organizationId,
        );
        if (!result.success) {
          set({ status: "error", error: result.error });
        }
      },

      clearError: () => set({ error: null }),
    }),
    { name: "NotificationStore" },
  ),
);
