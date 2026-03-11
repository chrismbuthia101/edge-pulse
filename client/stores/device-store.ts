import { create } from 'zustand';
import { Device } from '@/lib/supabase/types';

interface DeviceStore {
  devices: Device[];
  onlineCount: number;
  updateDevice: (device: Device) => void;
  setDevices: (devices: Device[]) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: [],
  onlineCount: 0,

  updateDevice: (device: Device) =>
    set((state) => {
      const devices = state.devices.map((d) =>
        d.id === device.id ? device : d
      );
      // Add device if it doesn't exist yet (INSERT event)
      const exists = state.devices.some((d) => d.id === device.id);
      const updated = exists ? devices : [...devices, device];
      return {
        devices: updated,
        onlineCount: updated.filter((d) => d.status === 'online').length,
      };
    }),

  setDevices: (devices: Device[]) =>
    set({
      devices,
      onlineCount: devices.filter((d) => d.status === 'online').length,
    }),
}));