import { create } from 'zustand';

interface UIStore {
  sidebarCollapsed: boolean;
  alertDrawerOpen: boolean;
  selectedAlertId: string | null;
  commandPaletteOpen: boolean;
  toggleSidebar: () => void;
  openAlertDrawer: (alertId: string) => void;
  closeAlertDrawer: () => void;
  toggleCommandPalette: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  alertDrawerOpen: false,
  selectedAlertId: null,
  commandPaletteOpen: false,
  
  toggleSidebar: () => set((state) => ({ 
    sidebarCollapsed: !state.sidebarCollapsed 
  })),
  
  openAlertDrawer: (alertId: string) => set({ 
    alertDrawerOpen: true, 
    selectedAlertId: alertId 
  }),
  
  closeAlertDrawer: () => set({ 
    alertDrawerOpen: false, 
    selectedAlertId: null 
  }),
  
  toggleCommandPalette: () => set((state) => ({ 
    commandPaletteOpen: !state.commandPaletteOpen 
  })),
}));
