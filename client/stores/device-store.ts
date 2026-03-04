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
  
  updateDevice: (device: Device) => set((state) => ({
    devices: state.devices.map(d => 
      d.id === device.id ? device : d
    ),
    onlineCount: state.devices.filter(d => d.id !== device.id && d.status === 'online').length +
                  (device.status === 'online' ? 1 : 0),
  })),
  
  setDevices: (devices: Device[]) => set({
    devices,
    onlineCount: devices.filter(d => d.status === 'online').length,
  }),
}));
