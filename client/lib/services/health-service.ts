import { HealthRepository } from "@/lib/repositories/health-repository";
import type { DeviceHealthSnapshot, SystemHealth } from "@/lib/types/health";
import type { Result } from "@/lib/types/shared";

export class HealthService {
  private channelName: string | null = null;

  constructor(private readonly repository: HealthRepository) {}

  public async getDeviceHealth(options?: {
    limit?: number;
  }): Promise<Result<DeviceHealthSnapshot[]>> {
    const { data, error } = await this.repository.getDeviceHealth(options);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getSystemHealth(): Promise<Result<SystemHealth>> {
    const { data, error } = await this.repository.getSystemHealth();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public subscribeToHealthUpdates(callbacks: {
    onDeviceHealthUpdate?: (device: DeviceHealthSnapshot) => void;
    onError?: (error: Error) => void;
  }): () => void {
    if (this.channelName) {
      this.repository.unsubscribeFromHealthUpdates(this.channelName);
    }

    const repoCallbacks = {
      onInsert: (device: DeviceHealthSnapshot) => {
        callbacks.onDeviceHealthUpdate?.(device);
      },
      onUpdate: (device: DeviceHealthSnapshot) => {
        callbacks.onDeviceHealthUpdate?.(device);
      },
      onError: (err: unknown) => {
        callbacks.onError?.(
          err instanceof Error ? err : new Error(String(err)),
        );
      },
    };

    this.channelName =
      this.repository.subscribeToHealthUpdates(repoCallbacks);

    const currentChannel = this.channelName;
    return () => {
      if (this.channelName === currentChannel) {
        this.repository.unsubscribeFromHealthUpdates(this.channelName);
        this.channelName = null;
      }
    };
  }

  public unsubscribeFromHealthUpdates(): void {
    if (this.channelName) {
      this.repository.unsubscribeFromHealthUpdates(this.channelName);
      this.channelName = null;
    }
  }
}
