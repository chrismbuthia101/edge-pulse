import { create } from "zustand";
import { PrivacyRepository } from "@/lib/repositories";
import { PrivacyService } from "@/lib/services/privacy-service";
import type {
  PrivacySettings,
  PrivacySettingsUpdate,
} from "@/lib/supabase/types/privacy-settings";
import { errorMessage } from "@/lib/utils/error";
import { toast } from "sonner";

interface PrivacyStore {
  settings: PrivacySettings | null;
  loading: boolean;
  error: string | null;

  initialize: (deviceId?: string) => Promise<void>;
  refreshSettings: (deviceId?: string) => Promise<void>;
  updateSettings: (
    updates: PrivacySettingsUpdate,
    deviceId?: string,
  ) => Promise<void>;
  toggleEnhancedMode: (deviceId?: string) => Promise<void>;
  setSettings: (settings: PrivacySettings) => void;
  clearError: () => void;

  subscribeToSettings: (deviceId?: string) => void;
  unsubscribeFromSettings: (deviceId?: string) => void;
}

const privacyRepository = new PrivacyRepository();
const privacyService = new PrivacyService(privacyRepository);

export const usePrivacyStore = create<PrivacyStore>((set, get) => ({
  settings: null,
  loading: false,
  error: null,

  initialize: async (deviceId?: string) => {
    try {
      set({ loading: true, error: null });
      const settings = await privacyService.getPrivacySettings({ deviceId });
      set({ settings, loading: false });
      get().subscribeToSettings(deviceId);
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  refreshSettings: async (deviceId?: string) => {
    try {
      set({ loading: true, error: null });
      const settings = await privacyService.getPrivacySettings({ deviceId });
      set({ settings, loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  updateSettings: async (updates, deviceId) => {
    const previous = get().settings;

    // Optimistic update
    if (previous) {
      set({
        settings: {
          ...previous,
          ...updates,
          updated_at: new Date().toISOString(),
        },
      });
    }

    try {
      const updated = await privacyService.updatePrivacySettings(updates, {
        deviceId,
      });
      set({ settings: updated });
      toast.success("Privacy settings updated successfully");
    } catch (err) {
      // Rollback
      if (previous) set({ settings: previous });
      set({ error: errorMessage(err) });
      toast.error("Failed to update privacy settings");
    }
  },

  toggleEnhancedMode: async (deviceId) => {
    const previous = get().settings;

    // Optimistic update
    if (previous) {
      const newMode = !previous.enhanced_mode;
      set({
        settings: {
          ...previous,
          enhanced_mode: newMode,
          settings: {
            ...previous.settings,
            mask_usernames: newMode,
            redact_sensitive_data: newMode,
          },
          updated_at: new Date().toISOString(),
        },
      });
    }

    try {
      const updated = await privacyService.toggleEnhancedMode({ deviceId });
      set({ settings: updated });
      toast.success(
        updated.enhanced_mode
          ? "Enhanced privacy mode enabled"
          : "Standard privacy mode enabled",
      );
    } catch (err) {
      // Rollback
      if (previous) set({ settings: previous });
      set({ error: errorMessage(err) });
      toast.error("Failed to toggle privacy mode");
    }
  },

  setSettings: (settings) => set({ settings }),

  clearError: () => set({ error: null }),

  subscribeToSettings: (deviceId) => {
    privacyService.subscribeToPrivacySettings(deviceId || null, {
      onUpdate: (settings) => {
        set({ settings });
      },
      onError: (error) => {
        console.error("[PrivacyStore] Realtime error:", error);
        set({ error: errorMessage(error) });
      },
    });
  },

  unsubscribeFromSettings: (deviceId) => {
    privacyService.unsubscribeFromPrivacySettings(deviceId || null);
  },
}));

export { privacyService, privacyRepository };
