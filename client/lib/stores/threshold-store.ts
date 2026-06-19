import { create } from "zustand";
import { ThresholdRepository } from "@/lib/repositories/threshold-repository";
import { ThresholdService } from "@/lib/services/threshold-service";
import { toast } from "sonner";

interface ThresholdStore {
  threshold: number;
  loading: boolean;
  error: string | null;

  initialize: (modelId?: string, organizationId?: string) => Promise<void>;
  updateThreshold: (
    modelId: string,
    value: number,
    organizationId: string,
  ) => Promise<void>;
  setThreshold: (threshold: number) => void;
  clearError: () => void;
}

const thresholdRepository = new ThresholdRepository();
const thresholdService = new ThresholdService(thresholdRepository);

export const useThresholdStore = create<ThresholdStore>((set, get) => ({
  threshold: 0.75,
  loading: false,
  error: null,

  initialize: async (modelId?: string, organizationId?: string) => {
    try {
      set({ loading: true, error: null });
      const threshold = await thresholdService.getThreshold(
        modelId,
        organizationId,
      );
      set({ threshold, loading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load threshold";
      set({ error: message, loading: false });
    }
  },

  updateThreshold: async (
    modelId: string,
    value: number,
    organizationId: string,
  ) => {
    const previous = get().threshold;

    set({ threshold: value });

    try {
      await thresholdService.updateThreshold(modelId, value, organizationId);
      toast.success("Detection threshold updated successfully");
    } catch (err) {
      set({ threshold: previous });
      const message =
        err instanceof Error ? err.message : "Failed to update threshold";
      set({ error: message });
      toast.error(message);
    }
  },

  setThreshold: (threshold: number) => set({ threshold }),
  clearError: () => set({ error: null }),
}));

export { thresholdService, thresholdRepository };
