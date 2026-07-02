import { OrganizationRepository, type CreateOrganizationData } from "@/lib/repositories/organization-repository";
import { StorageRepository } from "@/lib/repositories/storage-repository";
import { createClient } from "@/lib/config/client";
import type { Organization, Billing } from "@/lib/types/organization";
import type { Result } from "@/lib/types/shared";

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
  public constructor(
    private readonly repository: OrganizationRepository,
    private readonly storageRepo: StorageRepository,
  ) {}

  public async findById(id: string): Promise<Organization | null> {
    const { data } = await this.repository.findById(id);
    return data;
  }

  public async findByIds(ids: string[]): Promise<Organization[]> {
    const { data } = await this.repository.findByIds(ids);
    return data;
  }

  public async findBySlug(slug: string): Promise<Organization | null> {
    const { data } = await this.repository.findBySlug(slug);
    return data;
  }

  public async getBilling(
    organizationId: string,
  ): Promise<Billing | null> {
    const { data } = await this.repository.getBilling(organizationId);
    return data;
  }

  public async createOrganization(
    data: CreateOrganizationData,
  ): Promise<Result<Organization>> {
    const { data: org, error } = await this.repository.create(data);
    if (error) return { success: false, error: error.message };
    if (!org) return { success: false, error: "Failed to create organization" };
    return { success: true, data: org };
  }

  public async updateOrganization(
    organizationId: string,
    data: Partial<Organization>,
  ): Promise<Organization | null> {
    const { data: updated } = await this.repository.update(organizationId, data);
    return updated;
  }

  public async deleteOrganization(
    id: string,
  ): Promise<Result<void>> {
    const { error } = await this.repository.delete(id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }

  public async uploadLogo(
    organizationId: string,
    file: File,
  ): Promise<Result<string>> {
    const path = `orgs/${organizationId}/logo`;
    const { path: filePath, error: uploadError } = await this.storageRepo.uploadFile("org-logos", path, file);
    if (uploadError) return { success: false, error: uploadError.message };
    if (!filePath) return { success: false, error: "Failed to upload logo" };

    const logoUrl = this.storageRepo.getPublicUrl("org-logos", filePath);

    const updated = await this.repository.update(organizationId, {
      logo_url: logoUrl,
    });

    if (!updated) return { success: false, error: "Organization not found" };

    return { success: true, data: logoUrl };
  }

  public async deleteLogo(organizationId: string): Promise<Result<void>> {
    const path = `orgs/${organizationId}/logo`;
    const { error: deleteError } = await this.storageRepo.deleteFile("org-logos", path);
    if (deleteError) return { success: false, error: deleteError.message };

    await this.repository.update(organizationId, { logo_url: null });

    return { success: true, data: undefined };
  }

  public async setupOrganization(
    data: SetupOrganizationData,
    accessToken: string,
  ): Promise<{ orgId?: string; error: string | null }> {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        return { error: "Supabase URL not configured" };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch(
        `${supabaseUrl}/functions/v1/setup-organization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(data),
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);
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

  public async inviteAnalyst(
    data: InviteAnalystData,
    accessToken: string,
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        return { result: null, error: "Supabase URL not configured" };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch(
        `${supabaseUrl}/functions/v1/invite-analyst`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(data),
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);
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
  new OrganizationRepository(createClient()),
  new StorageRepository(createClient()),
);
