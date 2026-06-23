import { create } from "zustand";
import { devtools } from "zustand/middleware";

const initialState = {
  sidebarCollapsed: false,
  alertDrawerOpen: false,
  selectedAlertId: null as string | null,
  commandPaletteOpen: false,
};

type UIStore = typeof initialState & {
  toggleSidebar: () => void;
  openAlertDrawer: (alertId: string) => void;
  closeAlertDrawer: () => void;
  toggleCommandPalette: () => void;
};

export const useUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      ...initialState,

      toggleSidebar: () =>
        set((state) => ({
          sidebarCollapsed: !state.sidebarCollapsed,
        })),

      openAlertDrawer: (alertId: string) =>
        set({
          alertDrawerOpen: true,
          selectedAlertId: alertId,
        }),

      closeAlertDrawer: () =>
        set({
          alertDrawerOpen: false,
          selectedAlertId: null,
        }),

      toggleCommandPalette: () =>
        set((state) => ({
          commandPaletteOpen: !state.commandPaletteOpen,
        })),
    }),
    { name: "UIStore" },
  ),
);
