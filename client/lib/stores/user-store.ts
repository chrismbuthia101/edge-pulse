import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OrgProfileService } from "@/lib/services/org-profile-service";
import { OrgProfileRepository } from "@/lib/repositories/org-profile-repository";
import { UserRepository } from "@/lib/repositories/user-repository";
import { createClient } from "@/lib/config/client";
import type { UserRole } from "@/lib/types/shared";

export interface ManagedUser {
  id: string;
  full_name: string;
  role: UserRole;
  account_status: "PENDING" | "ACTIVE" | "SUSPENDED";
  created_at: string;
}

type Status = "idle" | "loading" | "success" | "error";

let orgProfileService = new OrgProfileService(
  new OrgProfileRepository(createClient()),
);
const userRepository = new UserRepository(createClient());

const initialState = {
  users: [] as ManagedUser[],
  status: "idle" as Status,
  loading: false,
  error: null as string | null,
  searchTerm: "",
  filterRole: "all" as UserRole | "all",
  filterStatus: "all" as "all" | "active" | "inactive",
  userCache: {} as Record<string, string>,
};

type UserStore = typeof initialState & {
  initialize: (supabaseClient?: SupabaseClient) => void;
  setSearchTerm: (term: string) => void;
  setFilterRole: (role: UserRole | "all") => void;
  setFilterStatus: (status: "all" | "active" | "inactive") => void;
  toggleUserStatus: (userId: string, currentlyActive: boolean) => Promise<void>;
  resolveUserNames: (userIds: string[]) => Promise<void>;
  clearError: () => void;
};

export const useUserStore = create<UserStore>()(
  devtools(
    (set) => ({
      ...initialState,

      initialize: (supabaseClient) => {
        if (supabaseClient) {
          orgProfileService = new OrgProfileService(
            new OrgProfileRepository(supabaseClient),
          );
        }
        set({ status: "loading", error: null, loading: true });

        orgProfileService.getProfilesWithUsers({}).then((result) => {
          if (!result.success) {
            set({ error: result.error, status: "error", loading: false });
            return;
          }
          const users = result.data.map((p) => ({
            id: p.user_id,
            full_name: p.user?.full_name ?? "Unknown",
            role: p.role,
            account_status: p.account_status,
            created_at: p.joined_at,
          }));
          set({ users, status: "success", loading: false });
        });
      },

      setSearchTerm: (searchTerm) => set({ searchTerm }),

      setFilterRole: (filterRole) => set({ filterRole }),

      setFilterStatus: (filterStatus) => set({ filterStatus }),

      toggleUserStatus: async (userId, currentlyActive) => {
        const newStatus = currentlyActive ? "SUSPENDED" : "ACTIVE";
        const result = await orgProfileService.updateAccountStatus(
          userId,
          newStatus,
        );
        if (!result.success) {
          set({ error: result.error });
          return;
        }
        set((state) => ({
          users: state.users.map((u) =>
            u.id === userId ? { ...u, account_status: newStatus } : u,
          ),
        }));
      },

      resolveUserNames: async (userIds) => {
        const cache: Record<string, string> = {};
        await Promise.all(
          userIds.map(async (id) => {
            const { data } = await userRepository.getUserById(id);
            if (data) cache[id] = data.full_name;
          }),
        );
        set((state) => ({ userCache: { ...state.userCache, ...cache } }));
      },

      clearError: () => set({ error: null }),
    }),
    { name: "UserStore" },
  ),
);
