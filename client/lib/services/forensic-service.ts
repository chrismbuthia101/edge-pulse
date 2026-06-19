import { ForensicRepository, type ExportQuery } from '@/lib/repositories/forensic-repository';
import type { 
  TelemetryEvent, 
  FeatureVector 
} from '@/lib/supabase/types/telemetry';
import type { 
  Alert 
} from '@/lib/supabase/types/alerts';
import type { 
  AuditLogEntry 
} from '@/lib/supabase/types';

export type ExportType = 'telemetry' | 'alerts' | 'audit_logs' | 'features';

export interface ExportData {
  telemetry?: TelemetryEvent[];
  alerts?: Alert[];
  audit_logs?: AuditLogEntry[];
  features?: FeatureVector[];
}

export interface ExportOptions {
  format: 'JSON' | 'CSV' | 'Parquet';
  filename: string;
}

export class ForensicService {
  private repository: ForensicRepository;

  constructor(repository?: ForensicRepository) {
    this.repository = repository || new ForensicRepository();
  }

  async exportData(
    exportType: ExportType,
    query: ExportQuery,
    options: ExportOptions
  ): Promise<{ data: unknown; filename: string; mimeType: string }> {
    let data: unknown;

    switch (exportType) {
      case 'telemetry':
        data = await this.repository.getTelemetryEvents(query);
        break;
      case 'alerts':
        data = await this.repository.getAlertRecords(query);
        break;
      case 'audit_logs':
        data = await this.repository.getAuditLogs(query);
        break;
      case 'features':
        data = await this.repository.getFeatureVectors(query);
        break;
      default:
        throw new Error(`Unsupported export type: ${exportType}`);
    }

    const processedData = this.processData(data, options.format);
    const mimeType = this.getMimeType(options.format);

    return {
      data: processedData,
      filename: options.filename,
      mimeType
    };
  }

  private processData(data: unknown, format: string): string {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return '';
    }

    switch (format) {
      case 'CSV':
        return this.convertToCSV(data as Record<string, unknown>[]);
      case 'JSON':
        return JSON.stringify(data, null, 2);
      case 'Parquet':
        // For now, return JSON as Parquet requires special libraries
        // This would need a proper Parquet library implementation
        return JSON.stringify(data, null, 2);
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  private convertToCSV(data: Record<string, unknown>[]): string {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    const csvRows = data.map(row =>
      headers.map(header => {
        const value = row[header];
        // Handle null/undefined values
        if (value === null || value === undefined) return '""';
        // Convert objects/arrays to JSON strings
        if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        // Escape quotes in strings
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    );
    return [csvHeaders, ...csvRows].join('\n');
  }

  private getMimeType(format: string): string {
    switch (format) {
      case 'CSV':
        return 'text/csv';
      case 'JSON':
        return 'application/json';
      case 'Parquet':
        return 'application/octet-stream';
      default:
        return 'application/json';
    }
  }

  generateFilename(exportType: ExportType, startDate: string, endDate: string, format: string): string {
    return `${exportType}_export_${startDate}_to_${endDate}.${format.toLowerCase()}`;
  }
}
