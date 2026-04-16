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
    const previousPeriod = get().retentionPeriod;
    const previousStorage = get().storageUsage;
    
    set({ retentionPeriod: days, loading: true, error: null });
    
    try {
      await retentionService.updateRetentionSettings(deviceId || 'global', days);
      
      const storageUsage = await retentionService.refreshStorageUsage(deviceId || 'global', days);
      
      set({ storageUsage, loading: false });
      toast.success('Retention period updated');
    } catch (error) {
      set({ 
        retentionPeriod: previousPeriod,
        storageUsage: previousStorage,
        error: error instanceof Error ? error.message : 'Failed to update retention period',
        loading: false
      });
      toast.error(error instanceof Error ? error.message : 'Failed to update retention period');
    }
  },

  purgeOldData: async (deviceId?: string) => {
    const previousStorage = get().storageUsage;
    const optimisticStorage = {
      ...previousStorage,
      telemetry: previousStorage.telemetry * 0.9,
      total: previousStorage.total * 0.9,
    };
    
    set({ storageUsage: optimisticStorage, loading: true, error: null });
    
    try {
      const { retentionPeriod } = get();
      await retentionService.purgeOldData(deviceId || 'global', retentionPeriod);
      
      const storageUsage = await retentionService.refreshStorageUsage(deviceId || 'global', retentionPeriod);
      
      set({ storageUsage, loading: false });
      toast.success('Old data purged successfully');
    } catch (error) {
      set({ 
        storageUsage: previousStorage,
        error: error instanceof Error ? error.message : 'Failed to purge old data',
        loading: false
      });
      toast.error(error instanceof Error ? error.message : 'Failed to purge old data');
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
