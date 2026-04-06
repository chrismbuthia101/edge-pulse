import { BaseRepository } from '@/lib/repositories/base-repository';

export class ThresholdRepository extends BaseRepository {
  constructor() {
    // This repository doesn't map to a single table, so we'll use a placeholder
    super('threshold_config');
  }

  async getThreshold(deviceId?: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('anomaly_scores')
      .select('threshold_applied')
      .eq('device_id', deviceId || 'global')
      .order('scored_at', { ascending: false })
      .limit(1)
      .single() as {
        data: { threshold_applied: number } | null;
        error: { message: string; details?: string; hint?: string; code?: string } | null
      };

    if (error) {
      throw this.handleError(error);
    }

    return data?.threshold_applied ?? 0.75;
  }

  async updateThreshold(deviceId: string | undefined, value: number): Promise<void> {
    const { error } = await (this.supabase
      .from('agent_config') as unknown as {
        upsert: (data: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      })
      .upsert({
        device_id: deviceId || null,
        key: 'detection_threshold',
        value: value.toString(),
        updated_by: null,
        version: 1,
      });

    if (error) {
      throw this.handleError(error);
    }
  }
}
