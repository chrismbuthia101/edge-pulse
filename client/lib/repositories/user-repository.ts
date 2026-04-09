import {
  BaseRepository,
  type QueryOptions,
} from '@/lib/repositories/base-repository';
import {
  parseSearchQuery,
} from '@/lib/repositories/query-utils';

export interface AnalystUser {
  user_id: string;
  full_name: string;
  role: "ANALYST" | "ADMINISTRATOR";
  department: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  email?: string;
  approval_status?: "PENDING" | "APPROVED" | "REJECTED";
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
}

export interface UserQueryOptions extends QueryOptions {
  role?: "ANALYST" | "ADMINISTRATOR";
  isActive?: boolean;
  department?: string;
  search?: string;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
}

export interface UserSubscriptionCallbacks {
  onInsert?: (user: AnalystUser) => void;
  onUpdate?: (user: AnalystUser) => void;
  onDelete?: (user: AnalystUser) => void;
  onError?: (error: unknown) => void;
}

export class UserRepository extends BaseRepository<AnalystUser> {
  constructor() {
    super('analyst_users');
  }

  private buildUserQuery(options: UserQueryOptions = {}) {
    const standardFilters: Record<string, unknown> = {};

    if (options.role) standardFilters.role = options.role;
    if (options.isActive !== undefined) standardFilters.is_active = options.isActive;
    if (options.department) standardFilters.department = options.department;
    if (options.approvalStatus) standardFilters.approval_status = options.approvalStatus;

    let query = this.buildQuery({
      select: options.select ?? `
        user_id,
        full_name,
        role,
        department,
        is_active,
        approval_status,
        approved_by,
        approved_at,
        rejection_reason,
        created_at,
        updated_at
      `.trim(),
      filters: standardFilters,
      orderBy: options.orderBy,
      limit: options.limit,
      offset: options.offset,
    });

    if (options.search) {
      const searchFilters = parseSearchQuery(options.search, ['full_name', 'department']);

      const searchConditions = searchFilters.map(filter => {
        if (filter.operator === 'ilike') {
          return `${filter.field}.ilike.%${filter.value}%`;
        }
        return `${filter.field}.${filter.operator}.${filter.value}`;
      }).join(',');

      query = query.or(searchConditions);
    }

    return query;
  }

  async findUsers(options: UserQueryOptions = {}): Promise<AnalystUser[]> {
    const cacheKey = options.cacheKey ?? `users_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildUserQuery(options);
        if (error) throw this.handleError(error);
        return (data ?? []) as unknown as AnalystUser[];
      },
      options.cacheTTL
    );
  }

  async getUserById(id: string): Promise<AnalystUser | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select(`
          user_id,
          full_name,
          role,
          department,
          is_active,
          approval_status,
          approved_by,
          approved_at,
          rejection_reason,
          created_at,
          updated_at
        `)
        .eq('user_id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw this.handleError(error);
      }
      return data as unknown as AnalystUser;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getUsersByRole(role: "ANALYST" | "ADMINISTRATOR"): Promise<AnalystUser[]> {
    return this.findUsers({
      role,
      orderBy: { column: 'created_at', ascending: false },
      cacheTTL: 2 * 60 * 1000,
    });
  }

  async getActiveUsers(): Promise<AnalystUser[]> {
    return this.findUsers({
      isActive: true,
      orderBy: { column: 'created_at', ascending: false },
      cacheTTL: 60 * 1000,
    });
  }

  async searchUsers(query: string, options: UserQueryOptions = {}): Promise<AnalystUser[]> {
    return this.findUsers({ ...options, search: query });
  }

  async updateUserStatus(id: string, isActive: boolean): Promise<AnalystUser> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('user_id', id)
        .select()
        .single();
      if (error) throw error;
      this.invalidateCache();
      return data as unknown as AnalystUser;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateUserRole(id: string, role: "ANALYST" | "ADMINISTRATOR"): Promise<AnalystUser> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({ role, updated_at: new Date().toISOString() })
        .eq('user_id', id)
        .select()
        .single();
      if (error) throw error;
      this.invalidateCache();
      return data as unknown as AnalystUser;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async createUser(userData: Omit<AnalystUser, 'user_id' | 'created_at' | 'updated_at'>): Promise<AnalystUser> {
    const now = new Date().toISOString();
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert({ ...userData, created_at: now, updated_at: now })
        .select()
        .single();
      if (error) throw error;
      this.invalidateCache();
      return data as unknown as AnalystUser;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async deleteUser(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('user_id', id);
      if (error) throw error;
      this.invalidateCache();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getPendingUsers(): Promise<AnalystUser[]> {
    return this.findUsers({
      approvalStatus: 'PENDING',
      isActive: true,
      orderBy: { column: 'created_at', ascending: false },
      cacheTTL: 30 * 1000,
    });
  }

  async approveUser(
    userId: string,
    role: 'ANALYST' | 'ADMINISTRATOR',
    approvedBy: string
  ): Promise<AnalystUser> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({
          role,
          approval_status: 'APPROVED',
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      this.invalidateCache();
      return data as unknown as AnalystUser;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async rejectUser(
    userId: string,
    rejectionReason: string,
    rejectedBy: string
  ): Promise<AnalystUser> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({
          approval_status: 'REJECTED',
          approved_by: rejectedBy,
          approved_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      this.invalidateCache();
      return data as unknown as AnalystUser;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getUsersByApprovalStatus(status: 'PENDING' | 'APPROVED' | 'REJECTED'): Promise<AnalystUser[]> {
    return this.findUsers({
      approvalStatus: status,
      orderBy: { column: 'created_at', ascending: false },
      cacheTTL: 60 * 1000,
    });
  }

  async getApprovedUsers(): Promise<AnalystUser[]> {
    return this.getUsersByApprovalStatus('APPROVED');
  }

  async getRejectedUsers(): Promise<AnalystUser[]> {
    return this.getUsersByApprovalStatus('REJECTED');
  }

  async reapproveUser(
    userId: string,
    role: 'ANALYST' | 'ADMINISTRATOR',
    approvedBy: string
  ): Promise<AnalystUser> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({
          role,
          approval_status: 'APPROVED',
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
          is_active: true,
          updated_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      this.invalidateCache();
      return data as unknown as AnalystUser;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // ── Realtime ───────────────────────────────────────────────────────────────
  subscribeToUsers(
    filters: Partial<UserQueryOptions> = {},
    callbacks: UserSubscriptionCallbacks = {}
  ): string {
    const channelName = `realtime-users-${Date.now()}`;

    this.subscribe(channelName, filters, (payload: unknown) => {
      try {
        const p = payload as { eventType: string; new?: AnalystUser; old?: AnalystUser };
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