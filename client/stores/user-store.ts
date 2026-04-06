import { create } from 'zustand';
import { UserRepository } from '@/lib/repositories';
import { UserService } from '@/lib/services/user-service';
import type { AnalystUser } from '@/lib/repositories/user-repository';
import { toast } from 'sonner';

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
  changeUserRole: (userId: string, newRole: "ANALYST" | "ADMINISTRATOR") => Promise<void>;
  createUser: (userData: { full_name: string; role: "ANALYST" | "ADMINISTRATOR"; department?: string; email?: string }) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  clearError: () => void;
}

const userRepository = new UserRepository();
const userService = new UserService(userRepository);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An unexpected error occurred';
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useUserStore = create<UserStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  users: [],
  loading: false,
  error: null,
  searchTerm: '',
  filterRole: 'all',
  filterStatus: 'all',

  // ── Lifecycle ──────────────────────────────────────────────────────────────

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

  // ── Actions ───────────────────────────────────────────────────────────────

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
    try {
      await userService.updateUserStatus(userId, { isActive: !isActive });
      toast.success(`User ${!isActive ? "activated" : "deactivated"} successfully`);
      get().refreshUsers();
    } catch (err) {
      console.error("Failed to toggle user status:", err);
      toast.error("Failed to update user status");
    }
  },

  changeUserRole: async (userId: string, newRole: "ANALYST" | "ADMINISTRATOR") => {
    try {
      await userService.updateUserRole(userId, { role: newRole });
      toast.success(`User role changed to ${newRole} successfully`);
      get().refreshUsers();
    } catch (err) {
      console.error("Failed to change user role:", err);
      toast.error("Failed to change user role");
    }
  },

  createUser: async (userData: { full_name: string; role: "ANALYST" | "ADMINISTRATOR"; department?: string; email?: string }) => {
    try {
      await userService.createUser({
        ...userData,
        department: userData.department || null,
        is_active: true,
      });
      toast.success("User created successfully");
      get().refreshUsers();
    } catch (err) {
      console.error("Failed to create user:", err);
      toast.error("Failed to create user");
    }
  },

  deleteUser: async (userId: string) => {
    try {
      await userService.deleteUser(userId);
      toast.success("User deleted successfully");
      get().refreshUsers();
    } catch (err) {
      console.error("Failed to delete user:", err);
      toast.error("Failed to delete user");
    }
  },

  clearError: () => set({ error: null }),
}));

export { userService, userRepository };
