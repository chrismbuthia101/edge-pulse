import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationProfile, UserProfile } from "@/lib/types/user";
import type { UserRole, AccountStatus } from "@/lib/types/shared";

export interface CreateOrgProfileData {
  user_id: string;
  organization_id?: string | null;
  role: UserRole;
  account_status?: AccountStatus;
  job_title?: string | null;
}

export interface OrgProfileSubscriptionCallbacks {
  onInsert?: (profile: OrganizationProfile) => void;
  onUpdate?: (profile: OrganizationProfile) => void;
  onDelete?: (profile: OrganizationProfile) => void;
  onError?: (error: Error) => void;
}

export class OrgProfileRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async findByUserId(
    userId: string,
  ): Promise<{
    data: OrganizationProfile[];
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .select("*")
        .eq("user_id", userId);

      if (error) throw error;

      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find organization profiles"),
      };
    }
  }

  public async findByOrganizationId(
    organizationId: string,
  ): Promise<{
    data: OrganizationProfile[];
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .select("*")
        .eq("organization_id", organizationId);

      if (error) throw error;

      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find organization profiles"),
      };
    }
  }

  public async findByRole(
    role: UserRole,
  ): Promise<{
    data: OrganizationProfile[];
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .select("*")
        .eq("role", role);

      if (error) throw error;

      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find profiles by role"),
      };
    }
  }

  public async findByStatus(
    status: AccountStatus,
  ): Promise<{
    data: OrganizationProfile[];
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .select("*")
        .eq("account_status", status);

      if (error) throw error;

      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find profiles by status"),
      };
    }
  }

  public async findByOrganizationAndRole(
    organizationId: string,
    role: UserRole,
  ): Promise<{
    data: OrganizationProfile[];
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("role", role);

      if (error) throw error;

      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find profiles by org and role"),
      };
    }
  }

  public async findByOrganizationAndStatus(
    organizationId: string,
    status: AccountStatus,
  ): Promise<{
    data: OrganizationProfile[];
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("account_status", status);

      if (error) throw error;

      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find profiles by org and status"),
      };
    }
  }

  public async findProfilesWithUsers(
    options?: {
      role?: UserRole;
      accountStatus?: AccountStatus;
      organizationId?: string;
    },
  ): Promise<{
    data: (OrganizationProfile & { user: UserProfile | null })[];
    error: Error | null;
  }> {
    try {
      let query = this.supabaseClient
        .schema("organization")
        .from("profiles")
        .select("*, user:users(*)");

      if (options?.role) {
        query = query.eq("role", options.role);
      }

      if (options?.accountStatus) {
        query = query.eq("account_status", options.accountStatus);
      }

      if (options?.organizationId) {
        query = query.eq("organization_id", options.organizationId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find profiles with users"),
      };
    }
  }

  public async create(
    data: CreateOrgProfileData,
  ): Promise<{
    data: OrganizationProfile | null;
    error: Error | null;
  }> {
    try {
      const { data: profile, error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .insert({
          user_id: data.user_id,
          organization_id: data.organization_id ?? null,
          role: data.role,
          account_status: data.account_status ?? ("PENDING" as AccountStatus),
          job_title: data.job_title ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return { data: profile, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to create organization profile"),
      };
    }
  }

  public async update(
    id: string,
    data: Partial<OrganizationProfile>,
  ): Promise<{
    data: OrganizationProfile | null;
    error: Error | null;
  }> {
    try {
      const { data: profile, error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      return { data: profile, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to update organization profile"),
      };
    }
  }

  public async updateRole(
    userId: string,
    role: UserRole,
  ): Promise<{
    data: OrganizationProfile | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .update({ role })
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to update role"),
      };
    }
  }

  public async updateAccountStatus(
    userId: string,
    status: AccountStatus,
  ): Promise<{
    data: OrganizationProfile | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .update({ account_status: status })
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to update account status"),
      };
    }
  }

  public async activateSetupProfile(
    userId: string,
  ): Promise<{
    data: OrganizationProfile | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .update({ account_status: "ACTIVE" as AccountStatus })
        .is("organization_id", null)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to activate setup profile"),
      };
    }
  }

  public async updateOrganizationMembership(
    userId: string,
    organizationId: string | null,
  ): Promise<{
    data: OrganizationProfile | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .update({ organization_id: organizationId })
        .is("organization_id", null)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to update organization membership"),
      };
    }
  }

  public async delete(
    id: string,
  ): Promise<{
    data: null;
    error: Error | null;
  }> {
    try {
      const { error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .delete()
        .eq("id", id);

      if (error) throw error;

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to delete organization profile"),
      };
    }
  }

  public async deleteByUserId(
    userId: string,
  ): Promise<{
    data: null;
    error: Error | null;
  }> {
    try {
      const { error } = await this.supabaseClient
        .schema("organization")
        .from("profiles")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to delete organization profile"),
      };
    }
  }

  public subscribeToProfileChanges(
    callbacks: OrgProfileSubscriptionCallbacks,
  ): string {
    const channel = this.supabaseClient.channel("org-profiles-changes");

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "organization",
        table: "profiles",
      },
      async (payload) => {
        try {
          if (payload.eventType === "INSERT" && callbacks.onInsert) {
            const result = await this.findByUserId(payload.new.user_id as string);
            if (result.data[0]) callbacks.onInsert(result.data[0]);
          } else if (payload.eventType === "UPDATE" && callbacks.onUpdate) {
            const result = await this.findByUserId(payload.new.user_id as string);
            if (result.data[0]) callbacks.onUpdate(result.data[0]);
          } else if (payload.eventType === "DELETE" && callbacks.onDelete) {
            callbacks.onDelete(payload.old as unknown as OrganizationProfile);
          }
        } catch (err) {
          callbacks.onError?.(
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      },
    );

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" && callbacks.onError) {
        callbacks.onError(new Error("Channel subscription error"));
      }
    });

    return channel.topic;
  }

  public unsubscribeFromProfileChanges(channelName: string): void {
    const channel = this.supabaseClient
      .getChannels()
      .find((c) => c.topic === channelName);

    if (channel) {
      this.supabaseClient.removeChannel(channel);
    }
  }
}
