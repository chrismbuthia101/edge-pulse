import { create } from "zustand";
import { UserRepository } from "@/lib/repositories";
import { UserService } from "@/lib/services/user-service";
import type { AnalystUser } from "@/lib/repositories/user-repository";
import type { UserRole } from "@/lib/supabase/types";
import { toast } from "sonner";

interface UserStore {
  users: AnalystUser[];
  pendingUsers: AnalystUser[];
  loading: boolean;
  error: string | null;
  searchTerm: string;
  filterRole: string;
  filterStatus: string;
  initialize: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  refreshPendingUsers: () => Promise<void>;
  setSearchTerm: (term: string) => void;
  setFilterRole: (role: string) => void;
  setFilterStatus: (status: string) => void;
  toggleUserStatus: (userId: string, isActive: boolean) => Promise<void>;
  createUser: (userData: {
    full_name: string;
    role: UserRole;
  }) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  approveUser: (userId: string) => Promise<void>;
  rejectUser: (userId: string, reason: string) => Promise<void>;
  reapproveUser: (userId: string) => Promise<void>;
  clearError: () => void;
}

const userRepository = new UserRepository();
const userService = new UserService(userRepository);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred";
}

export const useUserStore = create<UserStore>((set, get) => ({
  users: [],
  pendingUsers: [],
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

  refreshPendingUsers: async () => {
    try {
      const pending = await userRepository.findUsers({
        search: "",
        accountStatus: "PENDING",
        cacheTTL: 0,
      });
      set({ pendingUsers: pending });
    } catch (err) {
      console.error("Failed to load pending users:", err);
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

  createUser: async (userData: { full_name: string; role: UserRole }) => {
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
        full_name: userData.full_name,
        role: userData.role,
        account_status: "ACTIVE",
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

  approveUser: async (userId: string) => {
    const { pendingUsers } = get();
    set({
      pendingUsers: pendingUsers.filter((u) => u.id !== userId),
    });
    try {
      await userRepository.update(userId, {
        account_status: "ACTIVE",
      } as Partial<AnalystUser>);
      toast.success("User approved successfully");
      get().refreshUsers();
    } catch {
      toast.error("Failed to approve user");
      get().refreshPendingUsers();
    }
  },

  rejectUser: async (userId: string, _reason: string) => {
    const { pendingUsers } = get();
    set({
      pendingUsers: pendingUsers.filter((u) => u.id !== userId),
    });
    try {
      await userRepository.update(userId, {
        account_status: "SUSPENDED",
      } as Partial<AnalystUser>);
      toast.success("User rejected");
      get().refreshUsers();
    } catch (err) {
      toast.error("Failed to reject user");
      get().refreshPendingUsers();
    }
  },

  reapproveUser: async (userId: string) => {
    try {
      await userRepository.update(userId, {
        account_status: "ACTIVE",
      } as Partial<AnalystUser>);
      toast.success("User re-approved");
      get().refreshUsers();
    } catch (err) {
      toast.error("Failed to re-approve user");
    }
  },

  clearError: () => set({ error: null }),
}));

export { userService, userRepository };
