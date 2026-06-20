import {
  BaseRepository,
  type QueryOptions,
  type FilterValue,
} from "@/lib/repositories/base-repository";
import type { UserRow, ProfileRow } from "@/lib/supabase/types";
import type { UserRole, AccountStatus } from "@/lib/supabase/types/shared";

export interface UserWithProfile {
  profile_id: string;
  user_id: string;
  organization_id: string | null;
  role: UserRole;
  account_status: AccountStatus;
  job_title: string | null;
  joined_at: string;
  updated_at: string;
  id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
}

export type AnalystUser = UserWithProfile;

export interface UserQueryOptions extends QueryOptions {
  role?: UserRole | UserRole[];
  accountStatus?: AccountStatus | AccountStatus[];
  organizationId?: string;
  search?: string;
}

export interface UserSubscriptionCallbacks {
  onInsert?: (user: UserWithProfile) => void;
  onUpdate?: (user: UserWithProfile) => void;
  onDelete?: (user: UserWithProfile) => void;
  onError?: (error: unknown) => void;
}

function flattenProfile(raw: Record<string, unknown>): UserWithProfile {
  const user = (raw.user ?? {}) as Record<string, unknown>;
  return {
    profile_id: raw.id as string,
    user_id: raw.user_id as string,
    organization_id: raw.organization_id as string | null,
    role: raw.role as UserRole,
    account_status: raw.account_status as AccountStatus,
    job_title: raw.job_title as string | null,
    joined_at: raw.joined_at as string,
    updated_at: raw.updated_at as string,
    id: (user.id ?? raw.user_id) as string,
    full_name: (user.full_name ?? "") as string,
    username: (user.username as string | null) ?? null,
    avatar_url: (user.avatar_url as string | null) ?? null,
    created_at: (user.created_at as string) ?? "",
  };
}

export class UserRepository extends BaseRepository<ProfileRow> {
  constructor() {
    super("profiles");
    this.schema = "organization";
  }

  private profileQuery() {
    return this.getClient()
      .from("profiles")
      .select("*, user:user_id(*)");
  }

  private buildUserQuery(options: UserQueryOptions = {}) {
    let query = this.profileQuery();

    if (options.organizationId) {
      query = query.eq("organization_id", options.organizationId);
    }
    if (options.role) {
      query = Array.isArray(options.role)
        ? query.in("role", options.role)
        : query.eq("role", options.role);
    }
    if (options.accountStatus) {
      query = Array.isArray(options.accountStatus)
        ? query.in("account_status", options.accountStatus)
        : query.eq("account_status", options.accountStatus);
    }
    if (options.search) {
      const s = options.search.replace(/[%_]/g, "\\$&");
      query = query.or(`user.full_name.ilike.%${s}%`);
    }
    if (options.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? true,
        referencedTable: options.orderBy.column === "full_name" ? "user" : undefined,
      });
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset != null) {
      query = query.range(
        options.offset,
        options.offset + (options.limit ?? 10) - 1,
      );
    }

    return query;
  }

  async findUsers(options: UserQueryOptions = {}): Promise<UserWithProfile[]> {
    const cacheKey = options.cacheKey ?? `users_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildUserQuery(options);
        if (error) throw this.handleError(error);
        return ((data ?? []) as Record<string, unknown>[]).map(flattenProfile);
      },
      { ttl: options.cacheTTL },
    );
  }

  async getUserById(id: string): Promise<UserWithProfile | null> {
    try {
      const { data, error } = await this.profileQuery()
        .eq("user_id", id)
        .maybeSingle();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw this.handleError(error);
      }
      if (!data) return null;
      return flattenProfile(data as Record<string, unknown>);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getUsersByRole(role: UserRole): Promise<UserWithProfile[]> {
    return this.findUsers({
      role,
      orderBy: { column: "created_at", ascending: false },
      cacheTTL: 2 * 60 * 1000,
    });
  }

  async getActiveUsers(organizationId?: string): Promise<UserWithProfile[]> {
    const options: UserQueryOptions = {
      accountStatus: "ACTIVE",
      orderBy: { column: "created_at", ascending: false },
      cacheTTL: 60 * 1000,
    };
    if (organizationId) options.organizationId = organizationId;
    return this.findUsers(options);
  }

  async getOrgUsers(organizationId: string): Promise<UserWithProfile[]> {
    return this.findUsers({
      organizationId,
      orderBy: { column: "full_name", ascending: true },
      cacheTTL: 2 * 60 * 1000,
    });
  }

  async searchUsers(
    query: string,
    options: UserQueryOptions = {},
  ): Promise<UserWithProfile[]> {
    return this.findUsers({ ...options, search: query });
  }

  async updateUserStatus(
    userId: string,
    accountStatus: AccountStatus,
    organizationId?: string,
  ): Promise<UserWithProfile> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.getClient() as any)
      .from("profiles")
      .update({ account_status: accountStatus })
      .eq("user_id", userId)
      .select("*, user:user_id(*)")
      .single();

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    try {
      const { data, error } = await query;
      if (error) throw error;
      this.invalidateCache();
      return flattenProfile(data as Record<string, unknown>);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateUserRole(
    userId: string,
    role: UserRole,
    organizationId?: string,
  ): Promise<UserWithProfile> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.getClient() as any)
      .from("profiles")
      .update({ role })
      .eq("user_id", userId)
      .select("*, user:user_id(*)")
      .single();

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    try {
      const { data, error } = await query;
      if (error) throw error;
      this.invalidateCache();
      return flattenProfile(data as Record<string, unknown>);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async createUser(data: Partial<UserRow> & { role?: UserRole; organization_id?: string }): Promise<UserWithProfile> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.supabase as any;
    const { data: userData, error: userError } = await client
      .from("users")
      .insert({ id: data.id, full_name: data.full_name ?? "" })
      .select()
      .single();
    if (userError) throw this.handleError(userError);

    const profileInsert = {
      user_id: userData.id,
      organization_id: data.organization_id ?? null,
      role: data.role ?? "ORG_ANALYST",
      account_status: "ACTIVE",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profileData, error: profileError } = await (this.getClient() as any)
      .from("profiles")
      .insert(profileInsert)
      .select("*, user:user_id(*)")
      .single();
    if (profileError) {
      try { await client.from("users").delete().eq("id", userData.id); } catch {}
      throw this.handleError(profileError);
    }
    this.invalidateCache();
    return flattenProfile(profileData as Record<string, unknown>);
  }

  async deleteUser(id: string): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.getClient() as any)
        .from("profiles")
        .delete()
        .eq("user_id", id);
      this.invalidateCache();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  subscribeToUsers(
    filters: Partial<UserQueryOptions> = {},
    callbacks: UserSubscriptionCallbacks = {},
  ): string {
    const channelName = `realtime-users-${Date.now()}`;

    this.subscribe(channelName, filters as Record<string, FilterValue>, (payload: unknown) => {
      try {
        const p = payload as {
          eventType: string;
          new?: Record<string, unknown>;
          old?: Record<string, unknown>;
        };
        switch (p.eventType) {
          case "INSERT":
            if (p.new) callbacks.onInsert?.(flattenProfile(p.new));
            break;
          case "UPDATE":
            if (p.new) callbacks.onUpdate?.(flattenProfile(p.new));
            break;
          case "DELETE":
            if (p.old) callbacks.onDelete?.(flattenProfile(p.old));
            break;
        }
      } catch (error) {
        callbacks.onError?.(error);
      }
    });

    return channelName;
  }

  unsubscribeFromUsers(channelName: string): void {
    this.unsubscribe(channelName);
  }
}
