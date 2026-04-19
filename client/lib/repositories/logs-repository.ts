import { BaseRepository } from '@/lib/repositories/base-repository';
import type { TamperLogEntry, VerificationResult, LogDevice, HashChainStatus } from '@/lib/supabase/types';
import type { Database } from '@/lib/supabase/types/database';
import type { TamperAlert } from '@/lib/services/log-integrity-service';

type TamperEvidentLog = Database['public']['Tables']['tamper_evident_log']['Row'];

export class LogsRepository extends BaseRepository {
  constructor() {
    super('tamper_evident_log');
  }

  async getDevices(): Promise<string[]> {
    const { data: logData } = await this.supabase
      .from("tamper_evident_log")
      .select("device_id")
      .order("device_id");

    const devicesFromLogs = new Set((logData || []).map((log) => log.device_id));

    const { data: registryData, error: registryError } = await this.supabase
      .from("device_registry")
      .select("id");

    if (!registryError && registryData) {
      registryData.forEach(device => devicesFromLogs.add(device.id));
    }

    return Array.from(devicesFromLogs);
  }

  async getLogDevices(): Promise<LogDevice[]> {
    const { data, error } = await this.supabase
      .from("log_device_summary")
      .select("*")
      .order("device_name");

    if (error) throw error;

    return (data || []).map((row) => ({
      device_id: row.device_id,
      device_name: row.device_name || `Device-${row.device_id.slice(-4)}`,
      log_count: row.log_count || 0,
      last_log_sequence: row.last_log_sequence || 0,
      last_entry_timestamp: row.last_entry_timestamp,
    }));
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
      const { data, error } = await this.supabase
        .from('tamper_evident_log')
        .select('device_id, log_sequence_number, verified, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const deviceStatuses = new Map<string, HashChainStatus>();

      data?.forEach(log => {
        const existing = deviceStatuses.get(log.device_id);
        if (!existing || log.log_sequence_number > existing.total_entries) {
          deviceStatuses.set(log.device_id, {
            device_id: log.device_id,
            device_name: `Device-${log.device_id.slice(-4)}`,
            total_entries: log.log_sequence_number,
            verified: log.verified ?? false,
            broken_at_sequence: null, // Would need verification logic
            last_verified_at: log.created_at,
          });
        }
      });

      if (deviceStatuses.size === 0) {
        const { data: devices, error: deviceError } = await this.supabase
          .from('device_registry')
          .select('id, name, created_at');

        if (!deviceError && devices) {
          devices.forEach(device => {
            deviceStatuses.set(device.id, {
              device_id: device.id,
              device_name: device.name || `Device-${device.id.slice(-4)}`,
              total_entries: 0,
              verified: false,
              broken_at_sequence: null,
              last_verified_at: null,
            });
          });
        }
      }

      return Array.from(deviceStatuses.values());
    } catch (error) {
      console.error('Failed to fetch hash chain statuses:', error);
      return [];
    }
  }

  async verifyDeviceChain(deviceId: string): Promise<void> {
    try {
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

  async getTamperAlerts(): Promise<TamperAlert[]> {
    try {
      const { data: logs, error } = await this.supabase
        .from('tamper_evident_log')
        .select('*')
        .order('entry_timestamp_utc', { ascending: false });

      if (error) throw error;

      const alerts: TamperAlert[] = [];
      const deviceLogs = new Map<string, TamperEvidentLog[]>();

      (logs || []).forEach(log => {
        if (!deviceLogs.has(log.device_id)) {
          deviceLogs.set(log.device_id, []);
        }
        deviceLogs.get(log.device_id)!.push(log);
      });

      for (const [deviceId, deviceLogList] of deviceLogs) {
        deviceLogList.sort((a, b) => a.log_sequence_number - b.log_sequence_number);

        for (let i = 1; i < deviceLogList.length; i++) {
          const current = deviceLogList[i];
          const previous = deviceLogList[i - 1];

          if (current.log_sequence_number !== previous.log_sequence_number + 1) {
            alerts.push({
              id: `seq-gap-${deviceId}-${current.log_sequence_number}`,
              device_id: deviceId,
              device_name: `Device-${deviceId.slice(-4)}`,
              alert_type: 'SEQUENCE_GAP',
              severity: 'HIGH',
              message: `Gap detected in log sequence: expected ${previous.log_sequence_number + 1}, got ${current.log_sequence_number}`,
              sequence_number: current.log_sequence_number,
              detected_at: current.entry_timestamp_utc,
              status: 'ACTIVE',
              affected_entries: current.log_sequence_number - previous.log_sequence_number - 1
            });
          }

          // Check for hash chain breaks
          if (current.previous_entry_hash !== previous.entry_content_hash) {
            alerts.push({
              id: `hash-break-${deviceId}-${current.log_sequence_number}`,
              device_id: deviceId,
              device_name: `Device-${deviceId.slice(-4)}`,
              alert_type: 'CHAIN_BREAK',
              severity: 'CRITICAL',
              message: `Hash chain integrity compromised at entry #${current.log_sequence_number}`,
              sequence_number: current.log_sequence_number,
              detected_at: current.entry_timestamp_utc,
              status: 'ACTIVE',
              affected_entries: deviceLogList.length - i + 1
            });
          }
        }
      }

      return alerts;
    } catch (error) {
      console.error('Failed to fetch tamper alerts:', error);
      return [];
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
