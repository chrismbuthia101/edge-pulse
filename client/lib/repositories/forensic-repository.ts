import { BaseRepository } from "./base-repository";
import type {
  TelemetryEvent,
  FeatureVector,
} from "@/lib/supabase/types/telemetry";
import type { Alert } from "@/lib/supabase/types/alerts";
import type { AuditLogEntry } from "@/lib/supabase/types";

export interface ExportQuery {
  startDate: Date;
  endDate: Date;
  deviceId?: string;
}

export class ForensicRepository extends BaseRepository {
  constructor() {
    super("");
  }

  async getTelemetryEvents(query: ExportQuery) {
    let dbQuery = this.supabase
      .schema("telemetry")
      .from("events")
      .select("*")
      .gte("created_at", query.startDate.toISOString())
      .lte("created_at", query.endDate.toISOString());

    if (query.deviceId) {
      dbQuery = dbQuery.eq("device_id", query.deviceId);
    }

    const { data, error } = await dbQuery;
    if (error) throw error;
    return data as TelemetryEvent[];
  }

  async getAlertRecords(query: ExportQuery) {
    let dbQuery = this.supabase
      .from("alerts")
      .select("*")
      .gte("created_at", query.startDate.toISOString())
      .lte("created_at", query.endDate.toISOString());

    if (query.deviceId) {
      dbQuery = dbQuery.eq("device_id", query.deviceId);
    }

    const { data, error } = await dbQuery;
    if (error) throw error;
    return data as Alert[];
  }

  async getAuditLogs(query: ExportQuery) {
    let dbQuery = this.supabase
      .schema("internal")
      .from("audit_logs")
      .select("*")
      .gte("timestamp", query.startDate.toISOString())
      .lte("timestamp", query.endDate.toISOString());

    if (query.deviceId) {
      dbQuery = dbQuery.eq("device_id", query.deviceId);
    }

    const { data, error } = await dbQuery;
    if (error) throw error;
    return data as AuditLogEntry[];
  }

  async getFeatureVectors(query: ExportQuery) {
    let dbQuery = this.supabase
      .schema("telemetry")
      .from("feature_vectors")
      .select("*")
      .gte("created_at", query.startDate.toISOString())
      .lte("created_at", query.endDate.toISOString());

    if (query.deviceId) {
      dbQuery = dbQuery.eq("device_id", query.deviceId);
    }

    const { data, error } = await dbQuery;
    if (error) throw error;
    return data as FeatureVector[];
  }
}
