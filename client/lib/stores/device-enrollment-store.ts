import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DeviceEnrollmentService } from "@/lib/services/device-enrollment-service";
import { DeviceEnrollmentRepository } from "@/lib/repositories/device-enrollment-repository";
import type { EnrollmentToken } from "@/lib/types/enrollment";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createClient } from "@/lib/config/client";
import { toast } from "sonner";

type Status = "idle" | "loading" | "success" | "error";

let deviceEnrollmentService = new DeviceEnrollmentService(
  new DeviceEnrollmentRepository(createClient()),
);

interface TokenSecret {
  tokenId: string;
  secret: string;
}

const initialState = {
  tokens: [] as EnrollmentToken[],
  tokenSecrets: {} as Record<string, string>,
  status: "idle" as Status,
  creating: false,
  error: null as string | null,
};

type DeviceEnrollmentStore = typeof initialState & {
  initialize: (supabaseClient: SupabaseClient) => void;
  refreshTokens: () => Promise<void>;
  createToken: (name: string, maxUses: number) => Promise<TokenSecret | null>;
  deleteToken: (tokenId: string) => Promise<void>;
  setTokens: (tokens: EnrollmentToken[]) => void;
  clearError: () => void;
  getTokenSecret: (tokenId: string) => string | undefined;
};

export const useDeviceEnrollmentStore = create<DeviceEnrollmentStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      initialize: (supabaseClient: SupabaseClient) => {
        deviceEnrollmentService = new DeviceEnrollmentService(
          new DeviceEnrollmentRepository(supabaseClient),
        );
      },

      refreshTokens: async () => {
        set({ status: "loading" });
        const result = await deviceEnrollmentService.getTokens();
        if (!result.success) {
          set({ error: result.error, status: "error" });
        } else {
          set({ tokens: result.data, status: "success" });
        }
      },

      createToken: async (name: string, maxUses: number) => {
        if (!name.trim()) {
          toast.error("Please enter a token name");
          return null;
        }

        const authUser = useAuthStore.getState().user;
        if (!authUser) {
          toast.error("You must be signed in to create a token");
          set({ creating: false });
          return null;
        }

        const activeOrganizationId = useAuthStore.getState().activeOrganizationId;
        if (!activeOrganizationId) {
          toast.error("You must belong to an organization to create enrollment tokens");
          set({ creating: false });
          return null;
        }

        set({ creating: true, error: null });

        const result = await deviceEnrollmentService.createToken(authUser.id, {
          name,
          maxUses,
          organizationId: activeOrganizationId,
        });

        if (!result.success) {
          set({ error: result.error });
          toast.error(result.error);
          set({ creating: false });
          return null;
        }

        set((state) => ({
          tokenSecrets: {
            ...state.tokenSecrets,
            [result.data.enrollmentToken.id]: result.data.token,
          },
        }));

        await get().refreshTokens();

        toast.success(`Token "${name}" created`);
        set({ creating: false });
        return {
          tokenId: result.data.enrollmentToken.id,
          secret: result.data.token,
        };
      },

      deleteToken: async (tokenId: string) => {
        set({ error: null });

        const result = await deviceEnrollmentService.deleteToken(tokenId);

        if (!result.success) {
          set({ error: result.error });
          toast.error(result.error);
          return;
        }

        set((state) => {
          const rest = { ...state.tokenSecrets };
          delete rest[tokenId];
          return { tokenSecrets: rest };
        });

        await get().refreshTokens();

        toast.success("Enrollment token deleted");
      },

      setTokens: (tokens) => set({ tokens }),
      clearError: () => set({ error: null }),
      getTokenSecret: (tokenId: string) => get().tokenSecrets[tokenId],
    }),
    { name: "DeviceEnrollmentStore" },
  ),
);
