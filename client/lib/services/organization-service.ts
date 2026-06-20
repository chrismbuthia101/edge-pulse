import { OrganizationRepository } from "@/lib/repositories/organization-repository";
import { StorageRepository } from "@/lib/repositories/storage-repository";
import type { OrganizationRow, BillingRow } from "@/lib/supabase/types/database";

export interface SetupOrganizationData {
  org_name: string;
  org_slug: string;
  domain?: string;
  logo_temp_path?: string;
}

export interface InviteAnalystData {
  email?: string;
  full_name?: string;
  invites?: { email: string; full_name: string }[];
}

export class OrganizationService {
  constructor(
    private readonly repository: OrganizationRepository,
    private readonly storageRepository: StorageRepository,
  ) {}

  async findById(id: string): Promise<OrganizationRow | null> {
    return this.repository.findById(id);
  }

  async findByIds(ids: string[]): Promise<OrganizationRow[]> {
    return this.repository.findByIds(ids);
  }

  async findBySlug(slug: string): Promise<OrganizationRow | null> {
    return this.repository.findBySlug(slug);
  }

  async getBilling(
    organizationId: string,
  ): Promise<BillingRow | null> {
    return this.repository.getBilling(organizationId);
  }

  async updateOrganization(
    organizationId: string,
    data: Partial<OrganizationRow>,
  ): Promise<OrganizationRow> {
    return this.repository.update(organizationId, data);
  }

  async setupOrganization(
    data: SetupOrganizationData,
    accessToken: string,
  ): Promise<{ orgId?: string; error: string | null }> {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        return { error: "Supabase URL not configured" };
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/setup-organization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(data),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        return {
          error: result.error || result.message || "Failed to setup organization",
        };
      }

      return { orgId: result.organization_id, error: null };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Failed to setup organization",
      };
    }
  }

  async inviteAnalyst(
    data: InviteAnalystData,
    accessToken: string,
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        return { result: null, error: "Supabase URL not configured" };
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/invite-analyst`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(data),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        return {
          result: null,
          error: result.error || result.message || "Failed to invite analyst",
        };
      }

      return { result, error: null };
    } catch (error) {
      return {
        result: null,
        error:
          error instanceof Error
            ? error.message
            : "Failed to invite analyst",
      };
    }
  }
}

export const organizationService = new OrganizationService(
  new OrganizationRepository(),
  new StorageRepository(),
);
