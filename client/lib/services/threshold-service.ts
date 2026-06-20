import { ThresholdRepository } from "@/lib/repositories/threshold-repository";

export class ThresholdService {
  constructor(private repository: ThresholdRepository) {}

  async getThreshold(
    modelId?: string,
    organizationId?: string,
  ): Promise<number> {
    try {
      const threshold = await this.repository.getThreshold(
        modelId,
        organizationId,
      );
      return threshold;
    } catch (error) {
      console.error("Failed to fetch threshold:", error);
      return 0.75;
    }
  }

  async updateThreshold(
    modelId: string,
    value: number,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.repository.updateThreshold(modelId, value, organizationId);
    } catch (error) {
      console.error("Failed to update threshold:", error);
      throw error;
    }
  }
}
