import { create } from 'zustand';
import { RetentionRepository } from '@/lib/repositories';
import { RetentionService } from '@/lib/services/retention-service';
import type { StorageUsage } from '@/lib/repositories/retention-repository';
import { toast } from 'sonner';

interface RetentionStore {
  retentionPeriod: number;
  storageUsage: StorageUsage;
  loading: boolean;
  error: string | null;

  initialize: (deviceId?: string) => Promise<void>;
  updateRetentionPeriod: (days: number, deviceId?: string) => Promise<void>;
  purgeOldData: (deviceId?: string) => Promise<void>;
  refreshStorageUsage: (deviceId?: string) => Promise<void>;
  clearError: () => void;
}

const retentionRepository = new RetentionRepository();
const retentionService = new RetentionService(retentionRepository);

export const useRetentionStore = create<RetentionStore>((set, get) => ({
  retentionPeriod: 90,
  storageUsage: {
    telemetry: 15.7,
    alerts: 2.3,
    features: 8.9,
    total: 26.9,
  },
  loading: false,
  error: null,

  initialize: async (deviceId?: string) => {
    set({ loading: true, error: null });
    
    try {
      const [retentionPeriod, storageUsage] = await Promise.all([
        retentionService.getRetentionSettings(deviceId || 'global'),
        retentionService.getStorageUsage(deviceId || 'global'),
      ]);

      set({ 
        retentionPeriod, 
        storageUsage, 
        loading: false 
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize retention settings';
      set({ error: errorMessage, loading: false });
      toast.error(errorMessage);
    }
  },

  updateRetentionPeriod: async (days: number, deviceId?: string) => {
    set({ loading: true, error: null });
    
    try {
      await retentionService.updateRetentionSettings(deviceId || 'global', days);
      
      // Refresh storage usage after updating retention period
      const storageUsage = await retentionService.refreshStorageUsage(deviceId || 'global', days);
      
      set({ 
        retentionPeriod: days, 
        storageUsage, 
        loading: false 
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update retention period';
      set({ error: errorMessage, loading: false });
      toast.error(errorMessage);
    }
  },

  purgeOldData: async (deviceId?: string) => {
    set({ loading: true, error: null });
    
    try {
      const { retentionPeriod } = get();
      await retentionService.purgeOldData(deviceId || 'global', retentionPeriod);
      
      // Refresh storage usage after purging
      const storageUsage = await retentionService.refreshStorageUsage(deviceId || 'global', retentionPeriod);
      
      set({ 
        storageUsage, 
        loading: false 
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to purge old data';
      set({ error: errorMessage, loading: false });
      toast.error(errorMessage);
    }
  },

  refreshStorageUsage: async (deviceId?: string) => {
    try {
      const { retentionPeriod } = get();
      const storageUsage = await retentionService.refreshStorageUsage(deviceId || 'global', retentionPeriod);
      
      set({ storageUsage });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh storage usage';
      set({ error: errorMessage });
      toast.error(errorMessage);
    }
  },

  clearError: () => set({ error: null }),
}));
