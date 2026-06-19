import { create } from "zustand";
import { UserRepository } from "@/lib/repositories";
import { UserService } from "@/lib/services/user-service";
import type { AnalystUser } from "@/lib/repositories/user-repository";
import type { UserRole } from "@/lib/supabase/types";
import { toast } from "sonner";

interface UserStore {
  users: AnalystUser[];
  loading: boolean;
  error: string | null;
  searchTerm: string;
  filterRole: string;
  filterStatus: string;

  initialize: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  setSearchTerm: (term: string) => void;
  setFilterRole: (role: string) => void;
  setFilterStatus: (status: string) => void;
  toggleUserStatus: (userId: string, isActive: boolean) => Promise<void>;
  createUser: (userData: {
    full_name: string;
    role: UserRole;
    email?: string;
  }) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  clearError: () => void;
}

const userRepository = new UserRepository();
const userService = new UserService(userRepository);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred";
}

export const useUserStore = create<UserStore>((set, get) => ({
  users: [],
  loading: false,
  error: null,
  searchTerm: "",
  filterRole: "all",
  filterStatus: "all",

  initialize: async () => {
    try {
      set({ loading: true, error: null });
      const users = await userService.getUsers();
      set({ users, loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  refreshUsers: async () => {
    try {
      set({ loading: true, error: null });
      const users = await userService.getUsers();
      set({ users, loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  setSearchTerm: (searchTerm: string) => {
    set({ searchTerm });
  },

  setFilterRole: (filterRole: string) => {
    set({ filterRole });
  },

  setFilterStatus: (filterStatus: string) => {
    set({ filterStatus });
  },

  toggleUserStatus: async (userId: string, isActive: boolean) => {
    const newStatus = !isActive;
    const { users } = get();

    set({
      users: users.map((user) =>
        user.id === userId
          ? { ...user, account_status: newStatus ? "ACTIVE" : "SUSPENDED" }
          : user,
      ),
    });

    try {
      await userService.updateUserStatus(userId, { isActive: newStatus });
      toast.success(
        `User ${newStatus ? "activated" : "deactivated"} successfully`,
      );
    } catch (err) {
      console.error("Failed to toggle user status:", err);
      toast.error("Failed to update user status");
      set({ users });
    }
  },

  createUser: async (userData: {
    full_name: string;
    role: UserRole;
    email?: string;
  }) => {
    const { users } = get();

    const optimisticUser: AnalystUser = {
      id: `temp-${Date.now()}`,
      full_name: userData.full_name,
      role: userData.role,
      account_status: "ACTIVE",
      organization_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    set({ users: [...users, optimisticUser] });

    try {
      await userService.createUser({
        ...userData,
        is_active: true,
      });
      toast.success("User created successfully");
      get().refreshUsers();
    } catch (err) {
      console.error("Failed to create user:", err);
      toast.error("Failed to create user");
      set({ users });
    }
  },

  deleteUser: async (userId: string) => {
    const { users } = get();

    set({
      users: users.filter((u) => u.id !== userId),
    });

    try {
      await userService.deleteUser(userId);
      toast.success("User deleted successfully");
    } catch (err) {
      console.error("Failed to delete user:", err);
      toast.error("Failed to delete user");
      set({ users });
    }
  },

  clearError: () => set({ error: null }),
}));

export { userService, userRepository };
