import {
  BaseRepository,
  type QueryOptions,
} from "@/lib/repositories/base-repository";
import type { EnrollmentTokenRow } from "@/lib/supabase/types/database";

export interface DeviceEnrollmentQueryOptions extends QueryOptions {
  includeExpired?: boolean;
  organizationId?: string;
}

export interface CreateTokenOptions {
  name?: string;
  maxUses: number;
  expiresDays?: number;
  organizationId: string;
}

export interface CreateTokenResult {
  token: string;
  tokenHash: string;
  enrollmentToken: EnrollmentTokenRow;
}

export class DeviceEnrollmentRepository extends BaseRepository<EnrollmentTokenRow> {
  constructor() {
    super("enrollment_tokens");
    this.schema = "devices";
  }

  async getTokens(
    options: DeviceEnrollmentQueryOptions = {},
  ): Promise<EnrollmentTokenRow[]> {
    const { includeExpired = false, organizationId } = options;

    let query = this.getClient()
      .from(this.tableName)
      .select("*")
      .order(options.orderBy?.column || "created_at", {
        ascending: options.orderBy?.ascending ?? false,
      })
      .limit(options.limit || 100);

    if (!includeExpired) {
      query = query.gt("expires_at", new Date().toISOString());
    }

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    const { data, error } = await query;
    if (error) throw this.handleError(error);
    return data || [];
  }

  async getTokenById(tokenId: string): Promise<EnrollmentTokenRow | null> {
    try {
      const { data, error } = await this.getClient()
        .from(this.tableName)
        .select("*")
        .eq("id", tokenId)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw this.handleError(error);
      }
      return data;
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async createToken(
    createdBy: string,
    options: CreateTokenOptions,
  ): Promise<EnrollmentTokenRow> {
    const { maxUses, name, expiresDays = 30, organizationId } = options;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresDays);

    try {
      const { data, error } = await this.getClient()
        .from(this.tableName)
        .insert({
          name: name || null,
          created_by: createdBy,
          max_uses: maxUses,
          current_uses: 0,
          expires_at: expiresAt.toISOString(),
          organization_id: organizationId,
        })
        .select()
        .single();

      if (error) throw this.handleError(error);
      this.invalidateCache();
      return data;
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async deleteToken(tokenId: string): Promise<void> {
    try {
      const { error } = await this.getClient()
        .from(this.tableName)
        .delete()
        .eq("id", tokenId);

      if (error) throw this.handleError(error);
      this.invalidateCache();
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async updateTokenUsage(
    tokenId: string,
    deviceId: string,
  ): Promise<EnrollmentTokenRow> {
    const { data, error } = await this.getClient().rpc("use_enrollment_token", {
      p_token_id: tokenId,
      p_device_id: deviceId,
    });

    if (error) throw this.handleError(error);
    if (!data)
      throw this.handleError(
        new Error("No data returned after updating token usage"),
      );
    return data as unknown as EnrollmentTokenRow;
  }

  async getTokensByUser(
    userId: string,
    options: DeviceEnrollmentQueryOptions = {},
  ): Promise<EnrollmentTokenRow[]> {
    let query = this.getClient()
      .from(this.tableName)
      .select("*")
      .eq("created_by", userId)
      .order(options.orderBy?.column || "created_at", {
        ascending: options.orderBy?.ascending ?? false,
      })
      .limit(options.limit || 100);

    if (options.organizationId) {
      query = query.eq("organization_id", options.organizationId);
    }

    const { data, error } = await query;
    if (error) throw this.handleError(error);
    return data || [];
  }

  async validateToken(tokenHash: string): Promise<EnrollmentTokenRow | null> {
    try {
      const { data, error } = await this.getClient()
        .from(this.tableName)
        .select("*")
        .eq("token_hash", tokenHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error) {
        throw this.handleError(error);
      }

      if (data && data.current_uses >= data.max_uses) {
        return null;
      }

      return data;
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async getEnrollmentStats(organizationId?: string): Promise<{
    totalTokens: number;
    activeTokens: number;
    expiredTokens: number;
    usedTokens: number;
    totalEnrollments: number;
  }> {
    const cacheKey = `enrollment_stats_${organizationId || "all"}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        let query = this.getClient()
          .from(this.tableName)
          .select("id, is_used, expires_at, current_uses");

        if (organizationId) {
          query = query.eq("organization_id", organizationId);
        }

        const { data: tokens, error } = await query;

        if (error) throw this.handleError(error);

        const now = new Date();
        const list = tokens || [];

        return {
          totalTokens: list.length,
          activeTokens: list.filter(
            (t) => !t.is_used && new Date(t.expires_at) > now,
          ).length,
          expiredTokens: list.filter((t) => new Date(t.expires_at) <= now)
            .length,
          usedTokens: list.filter((t) => t.is_used).length,
          totalEnrollments: list.reduce(
            (sum, t) => sum + (t.current_uses || 0),
            0,
          ),
        };
      },
      10 * 60 * 1000,
    );
  }
}
