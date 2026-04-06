import { DeviceDataRepository, type PurgeOptions, type PurgeResult } from '@/lib/repositories/device-data-repository';

export class DeviceDataService {
  constructor(private readonly repository: DeviceDataRepository) {}

  async purgeDeviceData(options: PurgeOptions): Promise<PurgeResult[]> {
    return this.repository.purgeDeviceData(options);
  }
}
