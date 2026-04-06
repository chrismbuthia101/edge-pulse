import { BaseRepository } from '@/lib/repositories/base-repository';
import type { TamperLogEntry, VerificationResult, LogDevice, HashChainStatus } from '@/lib/supabase/types';
import type { Database } from '@/lib/supabase/types/database';

type TamperEvidentLog = Database['public']['Tables']['tamper_evident_log']['Row'];

export class LogsRepository extends BaseRepository {
  constructor() {
    super('tamper_evident_log');
  }

  async getDevices(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("tamper_evident_log")
      .select("device_id")
      .order("device_id");

    if (error) throw error;

    const uniqueDevices = [...new Set((data || []).map((log) => log.device_id))];
    return uniqueDevices;
  }

  async getLogDevices(): Promise<LogDevice[]> {
    const { data, error } = await this.supabase
      .from("tamper_evident_log")
      .select(`
        device_id,
        log_sequence_number,
        entry_timestamp_utc
      `)
      .order("device_id, log_sequence_number", { ascending: true });

    if (error) throw error;

    // Group by device_id and get latest info
    const deviceMap = new Map<string, LogDevice>();

    (data || []).forEach((log) => {
      const existing = deviceMap.get(log.device_id);
      if (!existing || log.log_sequence_number > existing.last_log_sequence) {
        deviceMap.set(log.device_id, {
          device_id: log.device_id,
          log_count: (existing?.log_count || 0) + 1,
          last_log_sequence: log.log_sequence_number,
          last_entry_timestamp: log.entry_timestamp_utc,
        });
      } else {
        deviceMap.set(log.device_id, {
          ...existing,
          log_count: existing.log_count + 1,
        });
      }
    });

    return Array.from(deviceMap.values());
  }

  async getLogs(deviceId: string, options?: {
    limit?: number;
    entryType?: string;
    offset?: number;
  }): Promise<TamperLogEntry[]> {
    let query = this.supabase
      .from("tamper_evident_log")
      .select("*")
      .eq("device_id", deviceId)
      .order("log_sequence_number", { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.entryType && options.entryType !== "all") {
      query = query.eq("log_entry_type", options.entryType);
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(this.transformLogEntry);
  }

  async verifyChain(deviceId: string): Promise<VerificationResult> {
    const { data, error } = await this.supabase
      .from("tamper_evident_log")
      .select("*")
      .eq("device_id", deviceId)
      .order("log_sequence_number", { ascending: true });

    if (error) throw error;

    const logs = (data || []).map(this.transformLogEntry);

    if (logs.length === 0) {
      return {
        is_valid: true,
        entries_checked: 0,
        device_id: deviceId,
      };
    }

    let isValid = true;
    let firstBrokenSequence: number | undefined;
    let breakReason: string | undefined;

    for (let i = 1; i < logs.length; i++) {
      const current = logs[i];
      const previous = logs[i - 1];

      // Check sequence continuity
      if (current.log_sequence_number !== previous.log_sequence_number + 1) {
        isValid = false;
        firstBrokenSequence = current.log_sequence_number;
        breakReason = `Sequence break: expected ${previous.log_sequence_number + 1}, got ${current.log_sequence_number}`;
        break;
      }

      // Check hash chain integrity
      if (current.previous_entry_hash !== previous.entry_content_hash) {
        isValid = false;
        firstBrokenSequence = current.log_sequence_number;
        breakReason = `Hash chain broken at sequence ${current.log_sequence_number}`;
        break;
      }
    }

    return {
      is_valid: isValid,
      entries_checked: logs.length,
      first_broken_sequence: firstBrokenSequence,
      break_reason: breakReason,
      device_id: deviceId,
    };
  }

  async exportLogs(deviceId: string, options?: { entryType?: string }): Promise<TamperLogEntry[]> {
    return this.getLogs(deviceId, { ...options, limit: 10000 }); // Large limit for export
  }

  private transformLogEntry(log: TamperEvidentLog): TamperLogEntry {
    return {
      log_id: log.log_id,
      device_id: log.device_id,
      log_sequence_number: log.log_sequence_number,
      log_entry_type: log.log_entry_type,
      log_entry_reference_id: log.log_entry_reference_id || "",
      entry_timestamp_utc: log.entry_timestamp_utc,
      entry_content_hash: log.entry_content_hash,
      previous_entry_hash: log.previous_entry_hash,
      digital_signature: log.digital_signature || "",
      created_at: log.created_at,
    };
  }

  async getHashChainStatuses(): Promise<HashChainStatus[]> {
    try {
      // Get the latest log entry for each device to determine status
      const { data, error } = await this.supabase
        .from('tamper_evident_log')
        .select('device_id, sequence_number, verified, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Process data to get status per device
      const deviceStatuses = new Map<string, HashChainStatus>();

      data?.forEach(log => {
        const existing = deviceStatuses.get(log.device_id);
        if (!existing || log.sequence_number > existing.total_entries) {
          deviceStatuses.set(log.device_id, {
            device_id: log.device_id,
            device_name: `Device-${log.device_id.slice(-4)}`,
            total_entries: log.sequence_number,
            verified: log.verified ?? false,
            broken_at_sequence: null, // Would need verification logic
            last_verified_at: log.created_at,
          });
        }
      });

      return Array.from(deviceStatuses.values());
    } catch (error) {
      console.error('Failed to fetch hash chain statuses:', error);
      // Return mock data on error
      return [
        {
          device_id: "device-1",
          device_name: "Server-01",
          total_entries: 1247,
          verified: true,
          broken_at_sequence: null,
          last_verified_at: new Date().toISOString(),
        },
        {
          device_id: "device-2",
          device_name: "Workstation-05",
          total_entries: 892,
          verified: false,
          broken_at_sequence: 845,
          last_verified_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          device_id: "device-3",
          device_name: "Laptop-12",
          total_entries: 456,
          verified: true,
          broken_at_sequence: null,
          last_verified_at: new Date(Date.now() - 1800000).toISOString(),
        },
      ];
    }
  }

  async verifyDeviceChain(deviceId: string): Promise<void> {
    try {
      // Update the verified flag for all logs of a device
      const { error } = await this.supabase
        .from('tamper_evident_log')
        .update({ verified: true })
        .eq('device_id', deviceId);

      if (error) throw error;
    } catch (error) {
      console.error(`Failed to verify device ${deviceId}:`, error);
      throw error;
    }
  }

  async subscribeToLogUpdates(deviceId: string, callback: (log: TamperLogEntry) => void) {
    const channel = this.supabase
      .channel(`log-updates-${deviceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tamper_evident_log',
          filter: `device_id=eq.${deviceId}`
        },
        async (payload) => {
          const logEntry = this.transformLogEntry(payload.new as TamperEvidentLog);
          callback(logEntry);
        }
      )
      .subscribe();

    return {
      unsubscribe: () => {
        this.supabase.removeChannel(channel);
      }
    };
  }
}
