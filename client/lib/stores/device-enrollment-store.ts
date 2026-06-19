import { create } from "zustand";
import { DeviceEnrollmentRepository } from "@/lib/repositories";
import { DeviceEnrollmentService } from "@/lib/services/device-enrollment-service";
import { AuthService } from "@/lib/services/auth-service";
import { AuthRepository } from "@/lib/repositories/auth-repository";
import type { EnrollmentTokenRow } from "@/lib/supabase/types";
import { toast } from "sonner";

interface TokenSecret {
  tokenId: string;
  secret: string;
}

interface DeviceEnrollmentStore {
  tokens: EnrollmentTokenRow[];
  tokenSecrets: Map<string, string>; // token_id -> secret token (only for newly created)
  loading: boolean;
  creating: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  createToken: (name: string, maxUses: number) => Promise<TokenSecret | null>;
  deleteToken: (tokenId: string) => Promise<void>;
  setTokens: (tokens: EnrollmentTokenRow[]) => void;
  clearError: () => void;
  getTokenSecret: (tokenId: string) => string | undefined;
}

const deviceEnrollmentRepository = new DeviceEnrollmentRepository();
const authRepository = new AuthRepository();
const authService = new AuthService(authRepository);
const deviceEnrollmentService = new DeviceEnrollmentService(
  deviceEnrollmentRepository,
  authService,
);

export const useDeviceEnrollmentStore = create<DeviceEnrollmentStore>(
  (set, get) => ({
    tokens: [],
    tokenSecrets: new Map(),
    loading: false,
    creating: false,
    error: null,

    initialize: async () => {
      try {
        set({ loading: true, error: null });
        const tokens = await deviceEnrollmentService.getTokens();
        set({ tokens, loading: false });
      } catch (err) {
        const error =
          err instanceof Error
            ? err.message
            : "Failed to load enrollment tokens";
        set({ error, loading: false });
      }
    },

    refreshTokens: async () => {
      try {
        set({ loading: true, error: null });
        const tokens = await deviceEnrollmentService.getTokens();
        set({ tokens, loading: false });
      } catch (err) {
        const error =
          err instanceof Error
            ? err.message
            : "Failed to refresh enrollment tokens";
        set({ error, loading: false });
      }
    },

    createToken: async (name: string, maxUses: number) => {
      if (!name.trim()) {
        toast.error("Please enter a token name");
        return null;
      }

      set({ creating: true, error: null });

      try {
        const userData = await authService.getCurrentUser();
        const metadata = userData?.app_metadata ?? {};
        const organizationId = (metadata.organization_id as string) || "";
        const result = await deviceEnrollmentService.createToken({
          name,
          maxUses,
          organizationId,
        });

        // Store the secret so it can be shown/copied later
        set((state) => {
          const newSecrets = new Map(state.tokenSecrets);
          newSecrets.set(result.enrollmentToken.id, result.token);
          return { tokenSecrets: newSecrets };
        });

        await get().refreshTokens();

        toast.success(
          `Token "${name}" created. Secret token copied to clipboard.`,
        );
        return { tokenId: result.enrollmentToken.id, secret: result.token };
      } catch (err) {
        const error =
          err instanceof Error
            ? err.message
            : "Failed to create enrollment token";
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
        set((state) => {
          const newSecrets = new Map(state.tokenSecrets);
          newSecrets.delete(tokenId);
          return {
            tokens: state.tokens.filter((t) => t.id !== tokenId),
            tokenSecrets: newSecrets,
          };
        });

        toast.success("Enrollment token deleted");
      } catch (err) {
        const error =
          err instanceof Error ? err.message : "Failed to delete token";
        set({ error });
        toast.error(error);
      }
    },

    setTokens: (tokens) => set({ tokens }),
    clearError: () => set({ error: null }),
    getTokenSecret: (tokenId: string) => get().tokenSecrets.get(tokenId),
  }),
);

export { deviceEnrollmentService, deviceEnrollmentRepository };
