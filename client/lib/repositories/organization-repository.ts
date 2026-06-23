import type { SupabaseClient } from "@supabase/supabase-js";
import type { Organization, Billing } from "@/lib/types/organization";

export interface CreateOrganizationData {
  name: string;
  slug: string;
  domain?: string;
  logo_url?: string;
}

export class OrganizationRepository {
  private readonly tableName = "organizations";
  private readonly schema = "organization";

  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async findById(id: string): Promise<{
    data: Organization | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .select("*")
        .eq("id", id)
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
            : new Error("Failed to find organization"),
      };
    }
  }

  public async findBySlug(slug: string): Promise<{
    data: Organization | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .select("*")
        .eq("slug", slug)
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
            : new Error("Failed to find organization by slug"),
      };
    }
  }

  public async findByIds(ids: string[]): Promise<{
    data: Organization[];
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .select("*")
        .in("id", ids);
      if (error) throw error;
      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find organizations"),
      };
    }
  }

  public async findMany(options?: {
    orderBy?: { column: string; ascending?: boolean };
  }): Promise<{ data: Organization[]; error: Error | null }> {
    try {
      let query = this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .select("*");

      if (options?.orderBy) {
        query = query.order(options.orderBy.column, {
          ascending: options.orderBy.ascending ?? true,
        });
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
            : new Error("Failed to find organizations"),
      };
    }
  }

  public async countWhere(): Promise<{ data: number; error: Error | null }> {
    try {
      const { count, error } = await this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .select("*", { count: "exact", head: true });

      if (error) throw error;
      return { data: count ?? 0, error: null };
    } catch (error) {
      return {
        data: 0,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to count organizations"),
      };
    }
  }

  public async getBilling(organizationId: string): Promise<{
    data: Billing | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .schema(this.schema)
        .from("billing")
        .select("*")
        .eq("organization_id", organizationId)
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
            : new Error("Failed to get billing info"),
      };
    }
  }

  public async update(
    id: string,
    data: Partial<Organization>,
  ): Promise<{
    data: Organization | null;
    error: Error | null;
  }> {
    try {
      const { data: updated, error } = await this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { data: updated, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to update organization"),
      };
    }
  }

  public async create(
    data: CreateOrganizationData,
  ): Promise<{
    data: Organization | null;
    error: Error | null;
  }> {
    try {
      const { data: org, error } = await this.supabaseClient
        .schema(this.schema)
        .from(this.tableName)
        .insert({
          name: data.name,
          slug: data.slug,
          domain: data.domain ?? null,
          logo_url: data.logo_url ?? null,
          settings: {},
        })
        .select()
        .single();

      if (error) throw error;
      return { data: org, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to create organization"),
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
        .schema(this.schema)
        .from(this.tableName)
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
            : new Error("Failed to delete organization"),
      };
    }
  }
}
