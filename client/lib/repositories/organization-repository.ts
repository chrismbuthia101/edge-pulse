import { BaseRepository } from "@/lib/repositories/base-repository";
import type {
  OrganizationRow,
  BillingRow,
} from "@/lib/supabase/types/database";

export class OrganizationRepository extends BaseRepository<OrganizationRow> {
  constructor() {
    super("organizations");
    this.schema = "organization";
  }

  async findById(id: string): Promise<OrganizationRow | null> {
    try {
      const { data, error } = await this.getClient()
        .from(this.tableName)
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async findBySlug(slug: string): Promise<OrganizationRow | null> {
    try {
      const { data, error } = await this.getClient()
        .from(this.tableName)
        .select("*")
        .eq("slug", slug)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getBilling(organizationId: string): Promise<BillingRow | null> {
    try {
      const { data, error } = await this.supabase
        .schema("organization")
        .from("billing")
        .select("*")
        .eq("organization_id", organizationId)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }
}
