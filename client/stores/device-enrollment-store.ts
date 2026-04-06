import { create } from 'zustand';
import { DeviceEnrollmentRepository } from '@/lib/repositories';
import { DeviceEnrollmentService } from '@/lib/services/device-enrollment-service';
import type { EnrollmentToken } from '@/lib/supabase/types';
import { toast } from 'sonner';

interface DeviceEnrollmentStore {
  tokens: EnrollmentToken[];
  loading: boolean;
  creating: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  createToken: (name: string, maxUses: number) => Promise<string | null>;
  deleteToken: (tokenId: string) => Promise<void>;
  setTokens: (tokens: EnrollmentToken[]) => void;
  clearError: () => void;
}

const deviceEnrollmentRepository = new DeviceEnrollmentRepository();
const deviceEnrollmentService = new DeviceEnrollmentService(deviceEnrollmentRepository);

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useDeviceEnrollmentStore = create<DeviceEnrollmentStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  tokens: [],
  loading: false,
  creating: false,
  error: null,

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  initialize: async () => {
    try {
      set({ loading: true, error: null });
      const tokens = await deviceEnrollmentService.getTokens();
      set({ tokens, loading: false });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to load enrollment tokens';
      set({ error, loading: false });
    }
  },

  refreshTokens: async () => {
    try {
      set({ loading: true, error: null });
      const tokens = await deviceEnrollmentService.getTokens();
      set({ tokens, loading: false });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to refresh enrollment tokens';
      set({ error, loading: false });
    }
  },

  // ── Mutations ───────────────────────────────────────────────────────────────

  createToken: async (name: string, maxUses: number) => {
    if (!name.trim()) {
      toast.error('Please enter a token name');
      return null;
    }

    set({ creating: true, error: null });
    
    try {
      const result = await deviceEnrollmentService.createToken({ name, maxUses });
      
      // Refresh tokens after creation
      await get().refreshTokens();
      
      toast.success(`Token "${name}" created. Copied to clipboard.`);
      return result.token;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to create enrollment token';
      set({ error });
      toast.error(error);
      return null;
    } finally {
      set({ creating: false });
    }
  },

  deleteToken: async (tokenId: string) => {
    try {
      set({ error: null });
      await deviceEnrollmentService.deleteToken(tokenId);
      
      // Update local state optimistically
      set((state) => ({
        tokens: state.tokens.filter((t) => t.token_id !== tokenId)
      }));
      
      toast.success('Enrollment token deleted');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to delete token';
      set({ error });
      toast.error(error);
    }
  },

  setTokens: (tokens) => set({ tokens }),
  clearError: () => set({ error: null }),
}));

export { deviceEnrollmentService, deviceEnrollmentRepository };
