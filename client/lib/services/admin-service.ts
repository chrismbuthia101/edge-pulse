import { OrganizationRepository } from "@/lib/repositories/organization-repository";
import { DeviceRepository } from "@/lib/repositories/device-repository";
import { UserRepository } from "@/lib/repositories/user-repository";
import { AlertRepository } from "@/lib/repositories/alert-repository";
import type { OrganizationRow } from "@/lib/supabase/types/database";

export interface PlatformOverview {
  totalOrganizations: number;
  totalDevices: number;
  totalUsers: number;
  totalAlerts: number;
}

export interface OrganizationWithCounts extends OrganizationRow {
  user_count: number;
  device_count: number;
}

export class AdminService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly deviceRepository: DeviceRepository,
    private readonly userRepository: UserRepository,
    private readonly alertRepository: AlertRepository,
  ) {}

  async getPlatformOverview(): Promise<PlatformOverview> {
    const [totalOrganizations, totalDevices, totalUsers, totalAlerts] =
      await Promise.all([
        this.organizationRepository.countWhere(),
        this.deviceRepository.countWhere(),
        this.userRepository.countWhere(),
        this.alertRepository.countWhere(),
      ]);

    return { totalOrganizations, totalDevices, totalUsers, totalAlerts };
  }

  async getOrganizationsWithCounts(): Promise<OrganizationWithCounts[]> {
    const organizations =
      await this.organizationRepository.findMany({
        orderBy: { column: "created_at", ascending: false },
      });

    if (organizations.length === 0) return [];

    const orgIds = organizations.map((o) => o.id);

    const [userCounts, deviceCounts] = await Promise.all([
      this.getCountsByOrg(this.userRepository, orgIds),
      this.getCountsByOrg(this.deviceRepository, orgIds),
    ]);

    return organizations.map((org) => ({
      ...org,
      user_count: userCounts[org.id] ?? 0,
      device_count: deviceCounts[org.id] ?? 0,
    }));
  }

  private async getCountsByOrg(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo: any,
    orgIds: string[],
  ): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    const counts = await Promise.all(
      orgIds.map((id) =>
        repo.countWhere({ organization_id: id }).catch(() => 0),
      ),
    );
    orgIds.forEach((id, i) => {
      results[id] = counts[i];
    });
    return results;
  }
}

export const adminService = new AdminService(
  new OrganizationRepository(),
  new DeviceRepository(),
  new UserRepository(),
  new AlertRepository(),
);
