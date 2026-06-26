import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnrollmentToken } from "@/lib/types/enrollment";

export interface DeviceEnrollmentQueryOptions {
  includeExpired?: boolean;
  organizationId?: string;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
}

export interface CreateTokenData {
  name?: string;
  maxUses: number;
  expiresDays?: number;
  organizationId?: string;
}

export class DeviceEnrollmentRepository {
  private readonly tableName = "enrollment_tokens";
  private readonly schema = "devices";

  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async getTokens(
    options: DeviceEnrollmentQueryOptions = {},
  ): Promise<{ data: EnrollmentToken[]; error: Error | null }> {
    try {
      let query = this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .select("*")
        .order(options.orderBy?.column || "created_at", {
          ascending: options.orderBy?.ascending ?? false,
        })
        .limit(options.limit ?? 100);

      if (!options?.includeExpired) {
        query = query.gt("expires_at", new Date().toISOString());
      }

      if (options?.organizationId) {
        query = query.eq("organization_id", options.organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get enrollment tokens"),
      };
    }
  }

  public async getTokenById(
    tokenId: string,
  ): Promise<{ data: EnrollmentToken | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .select("*")
        .eq("id", tokenId)
        .single();

      if (error) {
        if (error.code === "PGRST116") return { data: null, error: null };
        throw error;
      }
      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get token by ID"),
      };
    }
  }

  public async createToken(
    createdBy: string,
    tokenHash: string,
    options: CreateTokenData,
  ): Promise<{ data: EnrollmentToken | null; error: Error | null }> {
    try {
      const { maxUses, name, expiresDays = 30, organizationId = null } = options;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresDays);

      const payload: Record<string, unknown> = {
        name: name || null,
        token_hash: tokenHash,
        created_by: createdBy,
        max_uses: maxUses,
        current_uses: 0,
        expires_at: expiresAt.toISOString(),
      };
      if (organizationId) {
        payload.organization_id = organizationId;
      }

      const { data, error } = await this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .insert(payload)
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
            : new Error("Failed to create enrollment token"),
      };
    }
  }

  public async deleteToken(
    tokenId: string,
  ): Promise<{ data: null; error: Error | null }> {
    try {
      const { error } = await this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .delete()
        .eq("id", tokenId);

      if (error) throw error;
      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to delete enrollment token"),
      };
    }
  }

  public async validateToken(
    tokenHash: string,
  ): Promise<{ data: EnrollmentToken | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .select("*")
        .eq("token_hash", tokenHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error) throw error;

      if (data && data.current_uses >= data.max_uses) {
        return { data: null, error: null };
      }

      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to validate token"),
      };
    }
  }
}
