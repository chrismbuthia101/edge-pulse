import { create } from "zustand";
import { UserRepository } from "@/lib/repositories";
import { UserService } from "@/lib/services/user-service";
import type { UserWithProfile } from "@/lib/repositories/user-repository";
import { toast } from "sonner";

interface UserStore {
  users: UserWithProfile[];
  pendingUsers: UserWithProfile[];
  loading: boolean;
  searchTerm: string;
  filterRole: string;
  filterStatus: string;
  initialize: () => Promise<void>;
  refreshPendingUsers: () => Promise<void>;
  setSearchTerm: (term: string) => void;
  setFilterRole: (role: string) => void;
  setFilterStatus: (status: string) => void;
  toggleUserStatus: (userId: string, isActive: boolean) => Promise<void>;
  approveUser: (userId: string) => Promise<void>;
  rejectUser: (userId: string) => Promise<void>;
  reapproveUser: (userId: string) => Promise<void>;
}

const userRepository = new UserRepository();
const userService = new UserService(userRepository);

export const useUserStore = create<UserStore>((set, get) => ({
  users: [],
  pendingUsers: [],
  loading: false,
  searchTerm: "",
  filterRole: "all",
  filterStatus: "all",

  initialize: async () => {
    set({ loading: true });
    const users = await userService.getUsers();
    set({ users, loading: false });
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
        user.user_id === userId
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

  approveUser: async (userId: string) => {
    const { pendingUsers } = get();
    set({
      pendingUsers: pendingUsers.filter((u) => u.user_id !== userId),
    });
    try {
      await userRepository.updateUserStatus(userId, "ACTIVE");
      toast.success("User approved successfully");
      get().initialize();
    } catch {
      toast.error("Failed to approve user");
      get().refreshPendingUsers();
    }
  },

  rejectUser: async (userId: string) => {
    const { pendingUsers } = get();
    set({
      pendingUsers: pendingUsers.filter((u) => u.user_id !== userId),
    });
    try {
      await userRepository.updateUserStatus(userId, "SUSPENDED");
      toast.success("User rejected");
      get().initialize();
    } catch (err) {
      toast.error("Failed to reject user");
      get().refreshPendingUsers();
    }
  },

  reapproveUser: async (userId: string) => {
    try {
      await userRepository.updateUserStatus(userId, "ACTIVE");
      toast.success("User re-approved");
      get().initialize();
    } catch (err) {
      toast.error("Failed to re-approve user");
    }
  },
}));
