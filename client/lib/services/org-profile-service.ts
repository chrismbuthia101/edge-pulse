import { OrgProfileRepository } from "@/lib/repositories/org-profile-repository";
import type { OrganizationProfile, UserProfile } from "@/lib/types/user";
import type { UserRole, AccountStatus, Result } from "@/lib/types/shared";

export class OrgProfileService {
  constructor(private readonly repository: OrgProfileRepository) {}

  public async getProfile(userId: string): Promise<Result<OrganizationProfile>> {
    const { data, error } = await this.repository.findByUserId(userId);
    if (error) return { success: false, error: error.message };
    const profile = data[0];
    if (!profile) return { success: false, error: "Profile not found" };
    return { success: true, data: profile };
  }

  public async getProfilesByOrganization(orgId: string): Promise<Result<OrganizationProfile[]>> {
    const { data, error } = await this.repository.findByOrganizationId(orgId);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getUsersByRole(role: UserRole): Promise<Result<OrganizationProfile[]>> {
    const { data, error } = await this.repository.findByRole(role);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getUsersByStatus(status: AccountStatus): Promise<Result<OrganizationProfile[]>> {
    const { data, error } = await this.repository.findByStatus(status);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getProfilesWithUsers(
    options?: {
      role?: UserRole;
      accountStatus?: AccountStatus;
      organizationId?: string;
    },
  ): Promise<Result<(OrganizationProfile & { user: UserProfile | null })[]>> {
    const { data, error } = await this.repository.findProfilesWithUsers(options);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getProfileStatus(
    userId: string,
  ): Promise<Result<{ account_status: AccountStatus }>> {
    const { data, error } = await this.repository.findByUserId(userId);
    if (error) return { success: false, error: error.message };
    const profile = data[0];
    if (!profile) return { success: false, error: "Profile not found" };
    return { success: true, data: { account_status: profile.account_status } };
  }

  public async updateAccountStatus(
    userId: string,
    status: AccountStatus,
  ): Promise<Result<OrganizationProfile>> {
    const { data, error } = await this.repository.updateAccountStatus(userId, status);
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Profile not found" };
    return { success: true, data };
  }

  public async activateProfile(userId: string): Promise<Result<OrganizationProfile>> {
    const { data, error } = await this.repository.updateAccountStatus(userId, "ACTIVE");
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Profile not found" };
    return { success: true, data };
  }

  public async activateSetupProfile(userId: string): Promise<Result<OrganizationProfile>> {
    const { data, error } = await this.repository.activateSetupProfile(userId);
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Profile not found" };
    return { success: true, data };
  }

  public async updateRole(
    userId: string,
    role: UserRole,
  ): Promise<Result<OrganizationProfile>> {
    const { data, error } = await this.repository.updateRole(userId, role);
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Profile not found" };
    return { success: true, data };
  }

  public async switchOrganization(
    userId: string,
    organizationId: string | null,
  ): Promise<Result<OrganizationProfile>> {
    const { data, error } = await this.repository.updateOrganizationMembership(
      userId,
      organizationId,
    );
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Profile not found" };
    return { success: true, data };
  }

  public async getProfileOrNull(userId: string): Promise<Result<OrganizationProfile | null>> {
    const { data, error } = await this.repository.findByUserId(userId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: data[0] ?? null };
  }

  public async getProfilesByUserId(userId: string): Promise<Result<OrganizationProfile[]>> {
    const { data, error } = await this.repository.findByUserId(userId);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async createProfile(
    data: {
      user_id: string;
      organization_id?: string | null;
      role: UserRole;
      account_status?: AccountStatus;
      job_title?: string | null;
    },
  ): Promise<Result<OrganizationProfile>> {
    const { data: profile, error } = await this.repository.create(data);
    if (error) return { success: false, error: error.message };
    if (!profile) return { success: false, error: "Failed to create profile" };
    return { success: true, data: profile };
  }

  public async deleteProfile(id: string): Promise<Result<void>> {
    const { error } = await this.repository.delete(id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }

  public async deleteProfileByUserId(userId: string): Promise<Result<void>> {
    const { error } = await this.repository.deleteByUserId(userId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }

  public async isUserInOrganization(
    userId: string,
    organizationId: string,
  ): Promise<Result<boolean>> {
    const { data, error } = await this.repository.findByUserId(userId);
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: data.some((p) => p.organization_id === organizationId),
    };
  }

  public async getUserOrgRole(
    userId: string,
  ): Promise<Result<OrganizationProfile['role'] | null>> {
    const { data, error } = await this.repository.findByUserId(userId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: data[0]?.role ?? null };
  }

  public subscribeToProfileChanges(
    callbacks: {
      onUpdate?: (profile: OrganizationProfile) => void;
      onError?: (error: Error) => void;
    },
  ): string {
    return this.repository.subscribeToProfileChanges({
      onUpdate: (profile) => callbacks.onUpdate?.(profile),
      onError: (err) => callbacks.onError?.(err),
    });
  }

  public unsubscribeFromProfileChanges(channelName: string): void {
    this.repository.unsubscribeFromProfileChanges(channelName);
  }
}
