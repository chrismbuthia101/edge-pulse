import { HealthRepository } from '@/lib/repositories';
import type { DeviceHealthSnapshot, SystemHealth } from '@/lib/supabase/types';

export interface HealthServiceDependencies {
  repository: HealthRepository;
}

export class HealthService {
  private repository: HealthRepository;

  constructor(dependencies: HealthServiceDependencies) {
    this.repository = dependencies.repository;
  }

  async getDeviceHealth(options?: { limit?: number }): Promise<DeviceHealthSnapshot[]> {
    return this.repository.getDeviceHealth(options);
  }

  async getSystemHealth(): Promise<SystemHealth | null> {
    return this.repository.getSystemHealth();
  }

  async getDeviceById(deviceId: string): Promise<DeviceHealthSnapshot | null> {
    return this.repository.getDeviceById(deviceId);
  }

  async refreshDeviceHealth(): Promise<DeviceHealthSnapshot[]> {
    return this.getDeviceHealth({ limit: 100 });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  subscribeToHealthUpdates(_callbacks: {
    onDeviceHealthUpdate?: (device: DeviceHealthSnapshot) => void;
    onSystemHealthUpdate?: (systemHealth: SystemHealth) => void;
    onError?: (error: Error) => void;
  }) {
    // TODO: Implement health updates subscription
    // For now, return a placeholder channel name
    console.warn('Health updates subscription not yet implemented');
    return 'health-updates-placeholder';
  }
}
