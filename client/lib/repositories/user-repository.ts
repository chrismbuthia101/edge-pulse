import {
  BaseRepository,
  type QueryOptions,
} from '@/lib/repositories/base-repository';
import type { UserRow } from '@/lib/supabase/types/database';
import type { UserRole, AccountStatus } from '@/lib/supabase/types/shared';

export interface UserQueryOptions extends QueryOptions {
  role?: UserRole | UserRole[];
  accountStatus?: AccountStatus | AccountStatus[];
  organizationId?: string;
  search?: string;
}

export interface UserSubscriptionCallbacks {
  onInsert?: (user: UserRow) => void;
  onUpdate?: (user: UserRow) => void;
  onDelete?: (user: UserRow) => void;
  onError?: (error: unknown) => void;
}

export type AnalystUser = UserRow;

export class UserRepository extends BaseRepository<UserRow> {
  constructor() {
    super('users');
  }

  private buildUserQuery(options: UserQueryOptions = {}) {
    const standardFilters: Record<string, unknown> = {};

    if (options.role) standardFilters.role = options.role;
    if (options.accountStatus) standardFilters.account_status = options.accountStatus;
    if (options.organizationId) standardFilters.organization_id = options.organizationId;

    let query = this.buildQuery({
      select: options.select ?? '*',
      filters: standardFilters,
      orderBy: options.orderBy,
      limit: options.limit,
      offset: options.offset,
    });

    if (options.search) {
      const s = options.search.replace(/[%_]/g, '\\$&');
      query = query.or(
        `full_name.ilike.%${s}%`
      );
    }

    return query;
  }

  async findUsers(options: UserQueryOptions = {}): Promise<UserRow[]> {
    const cacheKey = options.cacheKey ?? `users_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildUserQuery(options);
        if (error) throw this.handleError(error);
        return (data ?? []) as unknown as UserRow[];
      },
      options.cacheTTL
    );
  }

  async getUserById(id: string): Promise<UserRow | null> {
    try {
      const { data, error } = await this.getClient()
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw this.handleError(error);
      }
      return data as unknown as UserRow;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getUsersByRole(role: UserRole): Promise<UserRow[]> {
    return this.findUsers({
      role,
      orderBy: { column: 'created_at', ascending: false },
      cacheTTL: 2 * 60 * 1000,
    });
  }

  async getActiveUsers(organizationId?: string): Promise<UserRow[]> {
    const options: UserQueryOptions = {
      accountStatus: 'ACTIVE',
      orderBy: { column: 'created_at', ascending: false },
      cacheTTL: 60 * 1000,
    };
    if (organizationId) options.organizationId = organizationId;
    return this.findUsers(options);
  }

  async getOrgUsers(organizationId: string): Promise<UserRow[]> {
    return this.findUsers({
      organizationId,
      orderBy: { column: 'full_name', ascending: true },
      cacheTTL: 2 * 60 * 1000,
    });
  }

  async searchUsers(query: string, options: UserQueryOptions = {}): Promise<UserRow[]> {
    return this.findUsers({ ...options, search: query });
  }

  async updateUserStatus(id: string, accountStatus: AccountStatus): Promise<UserRow> {
    return this.update(id, { account_status: accountStatus } as Partial<UserRow>);
  }

  async updateUserRole(id: string, role: UserRole): Promise<UserRow> {
    return this.update(id, { role } as Partial<UserRow>);
  }

  subscribeToUsers(
    filters: Partial<UserQueryOptions> = {},
    callbacks: UserSubscriptionCallbacks = {}
  ): string {
    const channelName = `realtime-users-${Date.now()}`;

    this.subscribe(channelName, filters, (payload: unknown) => {
      try {
        const p = payload as { eventType: string; new?: UserRow; old?: UserRow };
        switch (p.eventType) {
          case 'INSERT': callbacks.onInsert?.(p.new!); break;
          case 'UPDATE': callbacks.onUpdate?.(p.new!); break;
          case 'DELETE': callbacks.onDelete?.(p.old!); break;
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
