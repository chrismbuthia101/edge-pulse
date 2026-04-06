import { create } from 'zustand';
import { LogsRepository } from '@/lib/repositories';
import { LogsService } from '@/lib/services/logs-service';
import type { TamperLogEntry, VerificationResult, LogDevice } from '@/lib/supabase/types';
import { toast } from 'sonner';

interface LogsStore {
  // State
  logs: TamperLogEntry[];
  devices: string[];
  logDevices: LogDevice[];
  selectedDevice: string;
  loading: boolean;
  verifying: boolean;
  verificationResult: VerificationResult | null;
  searchTerm: string;
  entryTypeFilter: string;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  setSelectedDevice: (deviceId: string) => void;
  setEntryTypeFilter: (filter: string) => void;
  setSearchTerm: (term: string) => void;
  refreshLogs: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  verifyChain: () => Promise<void>;
  exportLogs: () => Promise<void>;
  clearError: () => void;

  // Queries
  getFilteredLogs: () => TamperLogEntry[];
  getDeviceById: (deviceId: string) => LogDevice | null;
}

const logsRepository = new LogsRepository();
const logsService = new LogsService({ repository: logsRepository });

let logSubscription: { unsubscribe: () => void } | null = null;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An unexpected error occurred';
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useLogsStore = create<LogsStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  logs: [],
  devices: [],
  logDevices: [],
  selectedDevice: 'all',
  loading: false,
  verifying: false,
  verificationResult: null,
  searchTerm: '',
  entryTypeFilter: 'all',
  error: null,

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  initialize: async () => {
    try {
      set({ loading: true, error: null });

      const [devices, logDevices] = await Promise.all([
        logsService.getDevices(),
        logsService.getLogDevices()
      ]);

      set({ devices, logDevices, loading: false });

      // Auto-select first device if available
      if (devices.length > 0 && get().selectedDevice === 'all') {
        get().setSelectedDevice(devices[0]);
      }
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  // ── Actions ────────────────────────────────────────────────────────────────

  setSelectedDevice: async (deviceId) => {
    set({ selectedDevice: deviceId, logs: [] });

    if (deviceId !== 'all') {
      await get().refreshLogs();
    }

    // Update subscription
    if (logSubscription) {
      logSubscription.unsubscribe();
      logSubscription = null;
    }

    if (deviceId !== 'all') {
      const subscription = await logsService.subscribeToLogUpdates(deviceId, {
        onNewLog: (log) => {
          set((state) => ({
            logs: [log, ...state.logs.slice(0, 99)]
          }));
        },
        onError: (error) => {
          set({ error: errorMessage(error) });
        }
      });
      logSubscription = subscription;
    }
  },

  setEntryTypeFilter: (filter) => {
    set({ entryTypeFilter: filter });
    if (get().selectedDevice !== 'all') {
      get().refreshLogs();
    }
  },

  setSearchTerm: (term) => {
    set({ searchTerm: term });
  },

  refreshLogs: async () => {
    const { selectedDevice, entryTypeFilter } = get();
    if (selectedDevice === 'all') return;

    try {
      set({ loading: true, error: null });

      const logs = await logsService.getLogs(selectedDevice, {
        limit: 100,
        entryType: entryTypeFilter
      });

      set({ logs, loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  refreshDevices: async () => {
    try {
      set({ loading: true, error: null });

      const [devices, logDevices] = await Promise.all([
        logsService.getDevices(),
        logsService.getLogDevices()
      ]);

      set({ devices, logDevices, loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  verifyChain: async () => {
    const { selectedDevice } = get();
    if (selectedDevice === 'all') {
      toast.error('Please select a device first');
      return;
    }

    try {
      set({ verifying: true, error: null });

      const result = await logsService.verifyChain(selectedDevice);
      set({ verificationResult: result, verifying: false });

      if (result.is_valid) {
        toast.success(`Chain verified successfully (${result.entries_checked} entries)`);
      } else {
        toast.error(`Chain validation failed: ${result.break_reason}`);
      }
    } catch (err) {
      set({ error: errorMessage(err), verifying: false });
      toast.error('Failed to verify chain');
    }
  },

  exportLogs: async () => {
    const { selectedDevice, entryTypeFilter } = get();
    if (selectedDevice === 'all') {
      toast.error('Please select a device first');
      return;
    }

    try {
      const logs = await logsService.exportLogs(selectedDevice, {
        entryType: entryTypeFilter
      });

      // Create CSV content
      const headers = [
        'Sequence Number', 'Entry Type', 'Timestamp', 'Content Hash',
        'Previous Hash', 'Reference ID', 'Digital Signature'
      ];
      const rows = logs.map(log => [
        logsService.formatSequenceNumber(log.log_sequence_number),
        logsService.getLogEntryTypeLabel(log.log_entry_type),
        logsService.formatTimestamp(log.entry_timestamp_utc),
        log.entry_content_hash,
        log.previous_entry_hash,
        log.log_entry_reference_id,
        log.digital_signature
      ]);

      const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-${selectedDevice}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${logs.length} log entries`);
    } catch (err) {
      set({ error: errorMessage(err) });
      toast.error('Failed to export logs');
    }
  },

  clearError: () => set({ error: null }),

  // ── Queries ───────────────────────────────────────────────────────────────

  getFilteredLogs: () => {
    const { logs, searchTerm } = get();

    if (!searchTerm) return logs;

    const term = searchTerm.toLowerCase();
    return logs.filter(log =>
      log.log_entry_type.toLowerCase().includes(term) ||
      log.entry_content_hash.toLowerCase().includes(term) ||
      log.log_sequence_number.toString().includes(term)
    );
  },

  getDeviceById: (deviceId) => {
    return get().logDevices.find(device => device.device_id === deviceId) || null;
  },
}));

export { logsService, logsRepository };
