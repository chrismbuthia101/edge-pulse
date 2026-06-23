import type { SupabaseClient } from "@supabase/supabase-js";

export interface PlatformDeviceSummary {
  organization_id: string;
  organization_name: string;
  total_devices: number;
  online: number;
  offline: number;
  gone_silent: number;
  unsynced: number;
  isolated: number;
  deactivated: number;
  high_risk: number;
  critical_risk: number;
}

export interface PlatformUserSummary {
  organization_id: string;
  total_users: number;
  admins: number;
  analysts: number;
  active: number;
  pending: number;
  suspended: number;
}

export interface PlatformAlertSummary {
  organization_id: string;
  total_alerts: number;
  pending: number;
  acknowledged: number;
  closed: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export class AdminViewRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async getDeviceSummary(): Promise<{
    data: PlatformDeviceSummary[];
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("internal")
        .from("platform_device_summary")
        .select("*");

      if (error) throw error;
      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get device summary"),
      };
    }
  }

  public async getUserSummary(): Promise<{
    data: PlatformUserSummary[];
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("internal")
        .from("platform_user_summary")
        .select("*");

      if (error) throw error;
      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get user summary"),
      };
    }
  }

  public async getAlertSummary(): Promise<{
    data: PlatformAlertSummary[];
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("internal")
        .from("platform_alert_summary")
        .select("*");

      if (error) throw error;
      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get alert summary"),
      };
    }
  }
}
