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
    super('telemetry_events');
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
        // Purge all data for device
        const tables = ['telemetry_events', 'alert_records', 'feature_vectors', 'tamper_evident_log'];
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
      .from('telemetry_events')
      .select('*', { count: 'exact', head: true })
      .eq('device_id', deviceId)
      .lt('created_at', cutoffDate);

    if (error) throw error;

    const { error: deleteError } = await this.supabase
      .from('telemetry_events')
      .delete()
      .eq('device_id', deviceId)
      .lt('created_at', cutoffDate);

    if (deleteError) throw deleteError;

    return {
      table: 'telemetry_events',
      rowsDeleted: count ?? 0,
    };
  }

  private async purgeAlertData(deviceId: string, cutoffDate: string): Promise<PurgeResult> {
    const { count, error } = await this.supabase
      .from('alert_records')
      .select('*', { count: 'exact', head: true })
      .eq('device_id', deviceId)
      .lt('created_at', cutoffDate);

    if (error) throw error;

    const { error: deleteError } = await this.supabase
      .from('alert_records')
      .delete()
      .eq('device_id', deviceId)
      .lt('created_at', cutoffDate);

    if (deleteError) throw deleteError;

    return {
      table: 'alert_records',
      rowsDeleted: count ?? 0,
    };
  }

  private async purgeTableData(table: string, deviceId: string, cutoffDate?: string): Promise<PurgeResult> {
    let query = this.supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('device_id', deviceId);

    if (cutoffDate) {
      query = query.lt('created_at', cutoffDate);
    }

    const { count, error } = await query;
    if (error) throw error;

    let deleteQuery = this.supabase
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
