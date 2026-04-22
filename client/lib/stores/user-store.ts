import { create } from 'zustand';
import { UserRepository } from '@/lib/repositories';
import { UserService } from '@/lib/services/user-service';
import type { AnalystUser } from '@/lib/repositories/user-repository';
import { toast } from 'sonner';

interface UserStore {
  users: AnalystUser[];
  pendingUsers: AnalystUser[];
  loading: boolean;
  error: string | null;
  searchTerm: string;
  filterRole: string;
  filterStatus: string;
  filterApprovalStatus: string;

  initialize: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  refreshPendingUsers: () => Promise<void>;
  setSearchTerm: (term: string) => void;
  setFilterRole: (role: string) => void;
  setFilterStatus: (status: string) => void;
  setFilterApprovalStatus: (status: string) => void;
  toggleUserStatus: (userId: string, isActive: boolean) => Promise<void>;
  approveUser: (userId: string) => Promise<void>;
  rejectUser: (userId: string, reason: string) => Promise<void>;
  reapproveUser: (userId: string) => Promise<void>;
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

export const useUserStore = create<UserStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  users: [],
  pendingUsers: [],
  loading: false,
  error: null,
  searchTerm: '',
  filterRole: 'all',
  filterStatus: 'all',
  filterApprovalStatus: 'all',

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

  refreshPendingUsers: async () => {
    try {
      set({ loading: true, error: null });
      const pendingUsers = await userRepository.getPendingUsers();
      set({ pendingUsers, loading: false });
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

  setFilterApprovalStatus: (filterApprovalStatus: string) => {
    set({ filterApprovalStatus });
  },

  toggleUserStatus: async (userId: string, isActive: boolean) => {
    const newStatus = !isActive;
    const { users } = get();

    // Optimistic update
    set({
      users: users.map(user =>
        user.user_id === userId
          ? { ...user, is_active: newStatus }
          : user
      )
    });

    try {
      await userService.updateUserStatus(userId, { isActive: newStatus });
      toast.success(`User ${newStatus ? "activated" : "deactivated"} successfully`);
    } catch (err) {
      console.error("Failed to toggle user status:", err);
      toast.error("Failed to update user status");
      // Revert optimistic update on error
      set({ users });
    }
  },


  createUser: async (userData: { full_name: string; role: "ANALYST" | "ADMINISTRATOR"; department?: string; email?: string }) => {
    const { users } = get();

    const optimisticUser: AnalystUser = {
      user_id: `temp-${Date.now()}`,
      full_name: userData.full_name,
      role: userData.role,
      department: userData.department || null,
      is_active: true,
      approval_status: "APPROVED",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    set({ users: [...users, optimisticUser] });

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
      set({ users });
    }
  },

  approveUser: async (userId: string) => {
    const { users, pendingUsers } = get();
    const pendingUser = pendingUsers.find(u => u.user_id === userId);
    const existingUser = users.find(u => u.user_id === userId);
    const role = "ANALYST";

    if (pendingUser) {
      set({
        pendingUsers: pendingUsers.filter(u => u.user_id !== userId),
        users: existingUser
          ? users.map(user =>
            user.user_id === userId
              ? { ...user, role, approval_status: "APPROVED" as const, is_active: true }
              : user
          )
          : [...users, {
            ...pendingUser,
            role,
            approval_status: "APPROVED" as const,
            is_active: true
          }]
      });
    } else {
      set({
        users: users.map(user =>
          user.user_id === userId
            ? { ...user, role, approval_status: "APPROVED" as const, is_active: true }
            : user
        )
      });
    }

    try {
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      await userRepository.approveUser(userId, role, currentUser.id);
      toast.success(`User approved as ${role}`);
    } catch (err) {
      console.error("Failed to approve user:", err);
      toast.error("Failed to approve user");
      set({ users, pendingUsers });
    }
  },

  rejectUser: async (userId: string, reason: string) => {
    const { users, pendingUsers } = get();
    const pendingUser = pendingUsers.find(u => u.user_id === userId);
    const existingUser = users.find(u => u.user_id === userId);

    if (pendingUser) {
      set({
        pendingUsers: pendingUsers.filter(u => u.user_id !== userId),
        users: existingUser
          ? users.map(user =>
            user.user_id === userId
              ? { ...user, approval_status: "REJECTED" as const, is_active: false, rejection_reason: reason }
              : user
          )
          : [...users, {
            ...pendingUser,
            approval_status: "REJECTED" as const,
            is_active: false,
            rejection_reason: reason
          }]
      });
    } else {
      set({
        users: users.map(user =>
          user.user_id === userId
            ? { ...user, approval_status: "REJECTED" as const, is_active: false, rejection_reason: reason }
            : user
        )
      });
    }

    try {
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      await userRepository.rejectUser(userId, reason, currentUser.id);
      toast.success("User rejected");
    } catch (err) {
      console.error("Failed to reject user:", err);
      toast.error("Failed to reject user");
      set({ users, pendingUsers });
    }
  },

  reapproveUser: async (userId: string) => {
    const { users } = get();
    const previousUser = users.find(u => u.user_id === userId);
    const role = "ANALYST";

    set({
      users: users.map(user =>
        user.user_id === userId
          ? { ...user, role, approval_status: "APPROVED" as const, is_active: true }
          : user
      )
    });

    try {
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      await userRepository.reapproveUser(userId, role, currentUser.id);
      toast.success(`User reapproved as ${role}`);
    } catch (err) {
      console.error("Failed to reapprove user:", err);
      toast.error("Failed to reapprove user");
      if (previousUser) {
        set({ users: users.map(u => u.user_id === userId ? previousUser : u) });
      }
    }
  },

  deleteUser: async (userId: string) => {
    const { users, pendingUsers } = get();

    set({
      users: users.filter(u => u.user_id !== userId),
      pendingUsers: pendingUsers.filter(u => u.user_id !== userId)
    });

    try {
      await userService.deleteUser(userId);
      toast.success("User deleted successfully");
    } catch (err) {
      console.error("Failed to delete user:", err);
      toast.error("Failed to delete user");
      set({ users, pendingUsers });
    }
  },

  clearError: () => set({ error: null }),
}));

export { userService, userRepository };
