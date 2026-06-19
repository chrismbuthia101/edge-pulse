import {
  BaseRepository,
} from '@/lib/repositories/base-repository';

export interface PurgeOptions {
  deviceId: string;
  cutoffDate: string;
  purgeType: 'telemetry' | 'alerts' | 'all';
}

export interface PurgeResult {
  table: string;
  rowsDeleted: number;
}

export class DeviceDataRepository extends BaseRepository {
  constructor() {
    super('events');
  }

  async purgeDeviceData(options: PurgeOptions): Promise<PurgeResult[]> {
    const results: PurgeResult[] = [];

    try {
      if (options.purgeType === 'telemetry') {
        const result = await this.purgeTelemetryData(options.deviceId, options.cutoffDate);
        results.push(result);
      } else if (options.purgeType === 'alerts') {
        const result = await this.purgeAlertData(options.deviceId, options.cutoffDate);
        results.push(result);
      } else {
        const tables = ['events', 'alerts', 'feature_vectors', 'audit_logs'];
        for (const table of tables) {
          const result = await this.purgeTableData(table, options.deviceId, options.cutoffDate);
          results.push(result);
        }
      }

      this.invalidateCache();
      return results;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async purgeTelemetryData(deviceId: string, cutoffDate: string): Promise<PurgeResult> {
    const { count, error } = await this.supabase
      .schema('telemetry')
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('device_id', deviceId)
      .lt('created_at', cutoffDate);

    if (error) throw error;

    const { error: deleteError } = await this.supabase
      .schema('telemetry')
      .from('events')
      .delete()
      .eq('device_id', deviceId)
      .lt('created_at', cutoffDate);

    if (deleteError) throw deleteError;

    return {
      table: 'events',
      rowsDeleted: count ?? 0,
    };
  }

  private async purgeAlertData(deviceId: string, cutoffDate: string): Promise<PurgeResult> {
    const { count, error } = await this.supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('device_id', deviceId)
      .lt('created_at', cutoffDate);

    if (error) throw error;

    const { error: deleteError } = await this.supabase
      .from('alerts')
      .delete()
      .eq('device_id', deviceId)
      .lt('created_at', cutoffDate);

    if (deleteError) throw deleteError;

    return {
      table: 'alerts',
      rowsDeleted: count ?? 0,
    };
  }

  private schemaForTable(table: string): string {
    switch (table) {
      case 'events':
      case 'feature_vectors':
        return 'telemetry';
      case 'audit_logs':
        return 'internal';
      default:
        return 'public';
    }
  }

  private async purgeTableData(table: string, deviceId: string, cutoffDate?: string): Promise<PurgeResult> {
    const schema = this.schemaForTable(table);
    const client = schema === 'public' ? this.supabase : this.supabase.schema(schema);

    let query = client
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('device_id', deviceId);

    if (cutoffDate) {
      query = query.lt('created_at', cutoffDate);
    }

    const { count, error } = await query;
    if (error) throw error;

    let deleteQuery = client
      .from(table)
      .delete()
      .eq('device_id', deviceId);

    if (cutoffDate) {
      deleteQuery = deleteQuery.lt('created_at', cutoffDate);
    }

    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw deleteError;

    return {
      table,
      rowsDeleted: count ?? 0,
    };
  }
}
