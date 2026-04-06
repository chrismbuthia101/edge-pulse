import { BaseRepository, type QueryOptions } from '@/lib/repositories/base-repository';
import type { EnrollmentToken } from '@/lib/supabase/types';

export interface DeviceEnrollmentQueryOptions extends QueryOptions {
  includeExpired?: boolean;
}

export interface DeviceEnrollmentLegacyOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'expires_at' | 'current_uses';
  orderDirection?: 'asc' | 'desc';
  includeExpired?: boolean;
}

export interface CreateTokenOptions {
  name?: string;
  maxUses: number;
  expiresDays?: number;
}

export interface CreateTokenResult {
  token: string;
  tokenHash: string;
  enrollmentToken: EnrollmentToken;
}

export class DeviceEnrollmentRepository extends BaseRepository<EnrollmentToken> {
  constructor() {
    super('device_enrollment_tokens');
  }

  async getTokens(options: DeviceEnrollmentQueryOptions = {}): Promise<EnrollmentToken[]> {
    const { includeExpired = false } = options;

    if (!includeExpired) {
      const legacyOptions: DeviceEnrollmentLegacyOptions = {
        includeExpired,
        limit: options.limit || 100,
        offset: options.offset || 0,
        orderBy: (options.orderBy?.column as 'created_at' | 'expires_at' | 'current_uses') || 'created_at',
        orderDirection: options.orderBy?.ascending ? 'asc' : 'desc'
      };
      return this.getTokensWithCustomFilter(legacyOptions);
    }

    return this.findMany({
      ...options,
      cacheTTL: 5 * 60 * 1000
    });
  }

  async getTokensLegacy(options: DeviceEnrollmentLegacyOptions = {}): Promise<EnrollmentToken[]> {
    const {
      limit = 100,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'desc',
      includeExpired = false
    } = options;

    return this.getTokensWithCustomFilter({
      limit,
      offset,
      orderBy,
      orderDirection,
      includeExpired
    });
  }

  private async getTokensWithCustomFilter(options: DeviceEnrollmentLegacyOptions): Promise<EnrollmentToken[]> {
    const { includeExpired = false, limit = 100, offset = 0, orderBy, orderDirection = 'desc' } = options;

    try {
      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .order(orderBy || 'created_at', { ascending: orderDirection === 'asc' })
        .range(offset, offset + limit - 1);

      if (!includeExpired) {
        query = query.or('expires_at.gt.now(),is_used.eq.false');
      }

      const { data, error } = await query;

      if (error) throw this.handleError(error);
      return data || [];
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async getTokenById(tokenId: string): Promise<EnrollmentToken | null> {
    return this.findById(tokenId);
  }

  async createToken(tokenHash: string, createdBy: string, options: CreateTokenOptions): Promise<EnrollmentToken> {
    const { maxUses, expiresDays = 30 } = options;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresDays);

    return this.create({
      token_hash: tokenHash,
      created_by: createdBy,
      max_uses: maxUses,
      current_uses: 0,
      expires_at: expiresAt.toISOString(),
    });
  }

  async deleteToken(tokenId: string): Promise<void> {
    await this.delete(tokenId);
  }

  async updateTokenUsage(tokenId: string, deviceId: string): Promise<EnrollmentToken> {
    const { data, error } = await this.supabase.rpc('use_enrollment_token', {
      p_token_id: tokenId,
      p_device_id: deviceId,
    });

    if (error) throw this.handleError(error);

    if (!data) {
      throw this.handleError(new Error('No data returned after updating token usage'));
    }

    return data;
  }

  async getTokensByUser(userId: string, options: DeviceEnrollmentQueryOptions = {}): Promise<EnrollmentToken[]> {
    return this.findMany({
      filters: { created_by: userId },
      ...options,
      cacheTTL: 5 * 60 * 1000
    });
  }

  async getTokensByUserLegacy(userId: string, options: DeviceEnrollmentLegacyOptions = {}): Promise<EnrollmentToken[]> {
    const { limit = 100, offset = 0, orderBy = 'created_at', orderDirection = 'desc' } = options;

    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('created_by', userId)
        .order(orderBy, { ascending: orderDirection === 'asc' })
        .range(offset, offset + limit - 1);

      if (error) throw this.handleError(error);
      return data || [];
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async validateToken(tokenHash: string): Promise<EnrollmentToken | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .lt('current_uses', 'max_uses')
      .eq('is_used', false)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found or invalid
      }
      throw this.handleError(error);
    }

    return data;
  }

  async getEnrollmentStats(): Promise<{
    totalTokens: number;
    activeTokens: number;
    expiredTokens: number;
    usedTokens: number;
    totalEnrollments: number;
  }> {
    return this.cachedQuery(
      'enrollment_stats',
      async () => {
        const tokens = await this.findMany();
        const now = new Date();

        const stats = {
          totalTokens: tokens.length,
          activeTokens: tokens.filter((t) => !t.is_used && new Date(t.expires_at) > now).length,
          expiredTokens: tokens.filter((t) => new Date(t.expires_at) <= now).length,
          usedTokens: tokens.filter((t) => t.is_used).length,
          totalEnrollments: tokens.reduce((sum, t) => sum + t.current_uses, 0),
        };

        return stats;
      },
      10 * 60 * 1000 // 10 minutes cache
    );
  }
}
