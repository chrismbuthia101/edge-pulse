import { create } from 'zustand';
import { ThresholdRepository } from '@/lib/repositories/threshold-repository';
import { ThresholdService } from '@/lib/services/threshold-service';
import { toast } from 'sonner';

interface ThresholdStore {
  threshold: number;
  loading: boolean;
  error: string | null;

  initialize: (deviceId?: string) => Promise<void>;
  updateThreshold: (deviceId: string | undefined, value: number) => Promise<void>;
  setThreshold: (threshold: number) => void;
  clearError: () => void;
}

const thresholdRepository = new ThresholdRepository();
const thresholdService = new ThresholdService(thresholdRepository);

export const useThresholdStore = create<ThresholdStore>((set, get) => ({
  // Initial state
  threshold: 0.75,
  loading: false,
  error: null,

  // Actions
  initialize: async (deviceId?: string) => {
    try {
      set({ loading: true, error: null });
      const threshold = await thresholdService.getThreshold(deviceId);
      set({ threshold, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load threshold';
      set({ error: message, loading: false });
    }
  },

  updateThreshold: async (deviceId: string | undefined, value: number) => {
    const previous = get().threshold;

    // Optimistic update
    set({ threshold: value });

    try {
      await thresholdService.updateThreshold(deviceId, value);
      toast.success('Detection threshold updated successfully');
    } catch (err) {
      // Rollback
      set({ threshold: previous });
      const message = err instanceof Error ? err.message : 'Failed to update threshold';
      set({ error: message });
      toast.error(message);
    }
  },

  setThreshold: (threshold: number) => set({ threshold }),
  clearError: () => set({ error: null }),
}));

export { thresholdService, thresholdRepository };
