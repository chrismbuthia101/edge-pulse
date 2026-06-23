import type { SupabaseClient } from "@supabase/supabase-js";
import { OrganizationRepository } from "@/lib/repositories/organization-repository";
import { AdminViewRepository } from "@/lib/repositories/admin-view-repository";
import type { Organization } from "@/lib/types/organization";

export interface PlatformOverview {
  totalOrganizations: number;
  totalDevices: number;
  totalUsers: number;
  totalAlerts: number;
}

export interface OrganizationWithCounts extends Organization {
  user_count: number;
  device_count: number;
}

export class AdminService {
  private readonly organizationRepository: OrganizationRepository;
  private readonly viewRepository: AdminViewRepository;

  constructor(supabaseClient: SupabaseClient) {
    this.organizationRepository = new OrganizationRepository(supabaseClient);
    this.viewRepository = new AdminViewRepository(supabaseClient);
  }

  public async getPlatformOverview(): Promise<{
    data: PlatformOverview | null;
    error: Error | null;
  }> {
    try {
      const [
        { data: totalOrganizations },
        deviceSummary,
        userSummary,
        alertSummary,
      ] = await Promise.all([
        this.organizationRepository.countWhere(),
        this.viewRepository.getDeviceSummary(),
        this.viewRepository.getUserSummary(),
        this.viewRepository.getAlertSummary(),
      ]);

      const totalDevices = deviceSummary.data.reduce(
        (sum, o) => sum + o.total_devices,
        0,
      );
      const totalUsers = userSummary.data.reduce(
        (sum, o) => sum + o.total_users,
        0,
      );
      const totalAlerts = alertSummary.data.reduce(
        (sum, o) => sum + o.total_alerts,
        0,
      );

      return {
        data: {
          totalOrganizations,
          totalDevices,
          totalUsers,
          totalAlerts,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get platform overview"),
      };
    }
  }

  public async getOrganizationsWithCounts(): Promise<{
    data: OrganizationWithCounts[] | null;
    error: Error | null;
  }> {
    try {
      const [orgResult, deviceSummary, userSummary] = await Promise.all([
        this.organizationRepository.findMany({
          orderBy: { column: "created_at", ascending: false },
        }),
        this.viewRepository.getDeviceSummary(),
        this.viewRepository.getUserSummary(),
      ]);

      const { data: organizations } = orgResult;
      if (organizations.length === 0) return { data: [], error: null };

      const deviceMap = new Map(
        deviceSummary.data.map((o) => [o.organization_id, o.total_devices]),
      );
      const userMap = new Map(
        userSummary.data.map((o) => [o.organization_id, o.total_users]),
      );

      return {
        data: organizations.map((org) => ({
          ...org,
          device_count: deviceMap.get(org.id) ?? 0,
          user_count: userMap.get(org.id) ?? 0,
        })),
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get organizations with counts"),
      };
    }
  }
}

import { createClient } from "@/lib/config/client";
export const adminService = new AdminService(createClient());
