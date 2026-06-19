import { LogsRepository, AuditLogRepository } from '@/lib/repositories';
import type { AuditLogEntry } from '@/lib/supabase/types';
import type { AuditLogQueryOptions } from '@/lib/repositories/logs-repository';
import type { AuditLogCreateInput } from '@/lib/repositories/audit-log-repository';

export interface LogsServiceDependencies {
  repository: LogsRepository;
  auditLogRepository?: AuditLogRepository;
}

export class LogsService {
  private repository: LogsRepository;
  private auditLogRepository: AuditLogRepository;

  constructor(dependencies: LogsServiceDependencies) {
    this.repository = dependencies.repository;
    this.auditLogRepository = dependencies.auditLogRepository ?? new AuditLogRepository();
  }

  async getAuditLogs(options: AuditLogQueryOptions = {}): Promise<AuditLogEntry[]> {
    return this.repository.findAuditLogs(options);
  }

  async getAuditLogsPaginated(options: AuditLogQueryOptions & { page: number; limit: number }) {
    return this.repository.findAuditLogsPaginated(options);
  }

  async getAuditLogsByDevice(deviceId: string, limit = 50): Promise<AuditLogEntry[]> {
    return this.repository.getAuditLogsByDevice(deviceId, limit);
  }

  async getAuditLogsByUser(userId: string, limit = 50): Promise<AuditLogEntry[]> {
    return this.repository.getAuditLogsByUser(userId, limit);
  }

  async getRecentAuditLogs(limit = 100): Promise<AuditLogEntry[]> {
    return this.repository.getRecentAuditLogs(limit);
  }

  async createAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    return this.repository.createAuditLog(entry);
  }

  async writeAuditLog(entry: AuditLogCreateInput): Promise<AuditLogEntry> {
    return this.auditLogRepository.write(entry);
  }

  async findByOrganization(organizationId: string, limit = 100): Promise<AuditLogEntry[]> {
    return this.auditLogRepository.findByOrganization(organizationId, limit);
  }

  async findByResource(resourceType: string, resourceId: string): Promise<AuditLogEntry[]> {
    return this.auditLogRepository.findByResource(resourceType, resourceId);
  }

  getSeverityLabel(severity: string): string {
    const labels: Record<string, string> = {
      'INFO': 'Info',
      'WARNING': 'Warning',
      'ERROR': 'Error',
    };
    return labels[severity] || severity;
  }

  getSeverityColor(severity: string): string {
    const colors: Record<string, string> = {
      'INFO': 'text-blue-500',
      'WARNING': 'text-amber-500',
      'ERROR': 'text-red-500',
    };
    return colors[severity] || 'text-gray-500';
  }

  getSeverityBg(severity: string): string {
    const backgrounds: Record<string, string> = {
      'INFO': 'bg-blue-500/10 border-blue-500/20',
      'WARNING': 'bg-amber-500/10 border-amber-500/20',
      'ERROR': 'bg-red-500/10 border-red-500/20',
    };
    return backgrounds[severity] || 'bg-gray-500/10 border-gray-500/20';
  }

  formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  formatAction(action: string): string {
    return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
