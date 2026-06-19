import { BaseRepository } from "@/lib/repositories/base-repository";

export interface ModelThreshold {
  id: string;
  organization_id: string;
  model_id: string;
  name: string;
  version: string;
  threshold: number;
  detector_type: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export class ThresholdRepository extends BaseRepository<ModelThreshold> {
  constructor() {
    super("models");
    this.schema = "internal";
  }

  async getThreshold(
    modelId?: string,
    organizationId?: string,
  ): Promise<number> {
    try {
      let query = this.getClient()
        .from(this.tableName)
        .select("threshold")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (modelId) query = query.eq("model_id", modelId);
      if (organizationId) query = query.eq("organization_id", organizationId);

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      return data?.threshold ?? 0.75;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateThreshold(
    modelId: string,
    value: number,
    organizationId: string,
  ): Promise<void> {
    try {
      const { error } = await this.getClient()
        .from(this.tableName)
        .update({ threshold: value })
        .eq("model_id", modelId)
        .eq("organization_id", organizationId);

      if (error) throw error;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getModelThresholds(organizationId: string): Promise<ModelThreshold[]> {
    try {
      const { data, error } = await this.getClient()
        .from(this.tableName)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      throw this.handleError(error);
    }
  }
}
