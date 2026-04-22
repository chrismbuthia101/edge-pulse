import { create } from 'zustand';
import { LogsRepository } from '@/lib/repositories';
import { LogIntegrityService, type TamperAlert, type IntegrityMetrics } from '@/lib/services/log-integrity-service';
import type { HashChainStatus } from '@/lib/supabase/types';
import { toast } from 'sonner';

interface LogIntegrityStore {
  hashChainStatuses: HashChainStatus[];
  tamperAlerts: TamperAlert[];
  integrityMetrics: IntegrityMetrics | null;
  loading: boolean;
  verifying: string | null;
  error: string | null;

  initialize: () => Promise<void>;
  refreshHashChainStatuses: () => Promise<void>;
  refreshIntegrityData: () => Promise<void>;
  verifyDeviceChain: (deviceId: string) => Promise<void>;
  setHashChainStatuses: (statuses: HashChainStatus[]) => void;
  clearError: () => void;

  subscribeToIntegrityUpdates: () => void;
  unsubscribeFromIntegrityUpdates: () => void;
}

const logsRepository = new LogsRepository();
const logIntegrityService = new LogIntegrityService({ repository: logsRepository });

// ─── Helpers ───────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An unexpected error occurred';
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useLogIntegrityStore = create<LogIntegrityStore>((set, get) => ({
  // Initial state
  hashChainStatuses: [],
  tamperAlerts: [],
  integrityMetrics: null,
  loading: false,
  verifying: null,
  error: null,

  // Lifecycle

  initialize: async () => {
    try {
      set({ loading: true, error: null });
      const [statuses, alerts, metrics] = await Promise.all([
        logIntegrityService.getHashChainStatuses(),
        logIntegrityService.getTamperAlerts(),
        logIntegrityService.getIntegrityMetrics()
      ]);
      set({
        hashChainStatuses: statuses,
        tamperAlerts: alerts,
        integrityMetrics: metrics,
        loading: false
      });
      get().subscribeToIntegrityUpdates();
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  refreshHashChainStatuses: async () => {
    try {
      set({ loading: true, error: null });
      const statuses = await logIntegrityService.getHashChainStatuses();
      set({ hashChainStatuses: statuses, loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  refreshIntegrityData: async () => {
    try {
      set({ loading: true, error: null });
      const [statuses, alerts, metrics] = await Promise.all([
        logIntegrityService.getHashChainStatuses(),
        logIntegrityService.getTamperAlerts(),
        logIntegrityService.getIntegrityMetrics()
      ]);
      set({
        hashChainStatuses: statuses,
        tamperAlerts: alerts,
        integrityMetrics: metrics,
        loading: false
      });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  // ── Mutations ───────────────────────────────────────────────────────────────

  verifyDeviceChain: async (deviceId: string) => {
    set({ verifying: deviceId });
    try {
      await logIntegrityService.verifyDeviceChain(deviceId);

      // Refresh the status after verification
      const statuses = await logIntegrityService.getHashChainStatuses();
      set({ hashChainStatuses: statuses });

      toast.success(`Hash chain verified for device ${deviceId.slice(-4)}`);
    } catch (err) {
      set({ error: errorMessage(err) });
      toast.error('Failed to verify hash chain');
    } finally {
      set({ verifying: null });
    }
  },

  setHashChainStatuses: (statuses) => {
    set({ hashChainStatuses: statuses });
  },

  clearError: () => set({ error: null }),

  // ── Realtime ───────────────────────────────────────────────────────────────

  subscribeToIntegrityUpdates: () => {
    // Subscribe to real-time updates for tamper evident logs
    logIntegrityService.subscribeToIntegrityUpdates({
      onStatusUpdate: (statuses: HashChainStatus[]) => {
        set({ hashChainStatuses: statuses });
      },
      onTamperAlert: (alert: TamperAlert) => {
        const currentAlerts = get().tamperAlerts;
        const alertExists = currentAlerts.some(a => a.id === alert.id);

        if (!alertExists) {
          set({ tamperAlerts: [alert, ...currentAlerts] });

          // Show toast notification for critical alerts
          if (alert.severity === "CRITICAL" || alert.severity === "HIGH") {
            toast.error(`Tamper alert: ${alert.alert_type.replace('_', ' ')} on ${alert.device_name}`, {
              duration: 5000,
            });
          }
        }
      },
      onIntegrityMetricsUpdate: (metrics: IntegrityMetrics) => {
        set({ integrityMetrics: metrics });
      },
      onVerificationComplete: (deviceId: string, success: boolean) => {
        if (success) {
          toast.success(`Verification completed for device ${deviceId.slice(-4)}`);
        } else {
          toast.error(`Verification failed for device ${deviceId.slice(-4)}`);
        }
      },
      onError: (error: Error) => {
        console.error('[LogIntegrityStore] Realtime error:', error);
        set({ error: errorMessage(error) });
      },
    });
  },

  unsubscribeFromIntegrityUpdates: () => {
    logIntegrityService.unsubscribeFromIntegrityUpdates();
  },
}));

export { logIntegrityService, logsRepository };
