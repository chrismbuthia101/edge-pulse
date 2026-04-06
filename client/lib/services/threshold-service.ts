import { ThresholdRepository } from '@/lib/repositories/threshold-repository';

export class ThresholdService {
  constructor(private repository: ThresholdRepository) { }

  async getThreshold(deviceId?: string): Promise<number> {
    try {
      const threshold = await this.repository.getThreshold(deviceId);
      return threshold;
    } catch (error) {
      console.error('Failed to fetch threshold:', error);
      return 0.75; // Default threshold
    }
  }

  async updateThreshold(deviceId: string | undefined, value: number): Promise<void> {
    try {
      await this.repository.updateThreshold(deviceId, value);
    } catch (error) {
      console.error('Failed to update threshold:', error);
      throw error;
    }
  }
}
