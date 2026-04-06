import { LogsRepository } from '@/lib/repositories';
import type { TamperLogEntry, VerificationResult, LogDevice } from '@/lib/supabase/types';

export interface LogsServiceDependencies {
  repository: LogsRepository;
}

export class LogsService {
  private repository: LogsRepository;

  constructor(dependencies: LogsServiceDependencies) {
    this.repository = dependencies.repository;
  }

  async getDevices(): Promise<string[]> {
    return this.repository.getDevices();
  }

  async getLogDevices(): Promise<LogDevice[]> {
    return this.repository.getLogDevices();
  }

  async getLogs(deviceId: string, options?: { 
    limit?: number; 
    entryType?: string; 
    offset?: number;
  }): Promise<TamperLogEntry[]> {
    return this.repository.getLogs(deviceId, options);
  }

  async verifyChain(deviceId: string): Promise<VerificationResult> {
    return this.repository.verifyChain(deviceId);
  }

  async exportLogs(deviceId: string, options?: { entryType?: string }): Promise<TamperLogEntry[]> {
    return this.repository.exportLogs(deviceId, options);
  }

  subscribeToLogUpdates(deviceId: string, callbacks: {
    onNewLog: (log: TamperLogEntry) => void;
    onError?: (error: Error) => void;
  }) {
    return this.repository.subscribeToLogUpdates(deviceId, (log) => {
      callbacks.onNewLog(log);
    });
  }

  getLogEntryTypeLabel(entryType: string): string {
    const labels: Record<string, string> = {
      'TELEMETRY': 'Telemetry Data',
      'ALERT': 'Security Alert',
      'DETECTION': 'Anomaly Detection',
      'SYNC': 'Data Sync',
      'SYSTEM': 'System Event',
    };
    return labels[entryType] || entryType;
  }

  getLogEntryTypeColor(entryType: string): string {
    const colors: Record<string, string> = {
      'TELEMETRY': 'text-blue-500',
      'ALERT': 'text-red-500',
      'DETECTION': 'text-orange-500',
      'SYNC': 'text-green-500',
      'SYSTEM': 'text-purple-500',
    };
    return colors[entryType] || 'text-gray-500';
  }

  getLogEntryTypeBg(entryType: string): string {
    const backgrounds: Record<string, string> = {
      'TELEMETRY': 'bg-blue-500/10 border-blue-500/20',
      'ALERT': 'bg-red-500/10 border-red-500/20',
      'DETECTION': 'bg-orange-500/10 border-orange-500/20',
      'SYNC': 'bg-green-500/10 border-green-500/20',
      'SYSTEM': 'bg-purple-500/10 border-purple-500/20',
    };
    return backgrounds[entryType] || 'bg-gray-500/10 border-gray-500/20';
  }

  formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  formatSequenceNumber(sequence: number): string {
    return `#${sequence.toString().padStart(6, '0')}`;
  }

  getVerificationStatusColor(isValid: boolean): string {
    return isValid ? 'text-green-500' : 'text-red-500';
  }

  getVerificationStatusBg(isValid: boolean): string {
    return isValid ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20';
  }
}
