import { BaseRepository } from './base-repository';
import type {
  TelemetryEvent,
  FeatureVector
} from '@/lib/supabase/types/telemetry';
import type {
  Alert
} from '@/lib/supabase/types/alerts';
import type {
  TamperEvidentLog
} from '@/lib/supabase/types/database';

export interface ExportQuery {
  startDate: Date;
  endDate: Date;
  deviceId?: string;
}

export class ForensicRepository extends BaseRepository {
  constructor() {
    super('');
  }
  async getTelemetryEvents(query: ExportQuery) {
    let dbQuery = this.supabase
      .from('telemetry_events')
      .select('*')
      .gte('created_at', query.startDate.toISOString())
      .lte('created_at', query.endDate.toISOString());

    if (query.deviceId) {
      dbQuery = dbQuery.eq('device_id', query.deviceId);
    }

    const { data, error } = await dbQuery;
    if (error) throw error;
    return data as TelemetryEvent[];
  }

  async getAlertRecords(query: ExportQuery) {
    let dbQuery = this.supabase
      .from('alert_records')
      .select('*')
      .gte('created_at', query.startDate.toISOString())
      .lte('created_at', query.endDate.toISOString());

    if (query.deviceId) {
      dbQuery = dbQuery.eq('device_id', query.deviceId);
    }

    const { data, error } = await dbQuery;
    if (error) throw error;
    return data as Alert[];
  }

  async getTamperEvidentLog(query: ExportQuery) {
    let dbQuery = this.supabase
      .from('tamper_evident_log')
      .select('*')
      .gte('created_at', query.startDate.toISOString())
      .lte('created_at', query.endDate.toISOString());

    if (query.deviceId) {
      dbQuery = dbQuery.eq('device_id', query.deviceId);
    }

    const { data, error } = await dbQuery;
    if (error) throw error;
    return data as TamperEvidentLog[];
  }

  async getFeatureVectors(query: ExportQuery) {
    let dbQuery = this.supabase
      .from('feature_vectors')
      .select('*')
      .gte('created_at', query.startDate.toISOString())
      .lte('created_at', query.endDate.toISOString());

    if (query.deviceId) {
      dbQuery = dbQuery.eq('device_id', query.deviceId);
    }

    const { data, error } = await dbQuery;
    if (error) throw error;
    return data as FeatureVector[];
  }
}
