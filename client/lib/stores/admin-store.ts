import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { AdminService, type OrganizationWithCounts } from "@/lib/services/admin-service";
import { createClient } from "@/lib/config/client";

export interface PlatformOverview {
  total_orgs: number;
  total_devices: number;
  total_users: number;
  total_alerts: number;
}

interface AdminState {
  overview: PlatformOverview | null;
  overviewLoading: boolean;
  organizations: OrganizationWithCounts[];
  organizationsLoading: boolean;
  fetchOverview: () => Promise<void>;
  fetchOrganizations: () => Promise<void>;
}

const supabase = createClient();
const adminService = new AdminService(supabase);

export const useAdminStore = create<AdminState>()(
  devtools(
    (set) => ({
      overview: null,
      overviewLoading: false,
      organizations: [],
      organizationsLoading: false,

      fetchOverview: async () => {
        set({ overviewLoading: true });
        const result = await adminService.getPlatformOverview();
        if (result.error) {
          set({ overviewLoading: false });
        } else if (result.data) {
          set({
            overview: {
              total_orgs: result.data.totalOrganizations,
              total_devices: result.data.totalDevices,
              total_users: result.data.totalUsers,
              total_alerts: result.data.totalAlerts,
            },
            overviewLoading: false,
          });
        }
      },

      fetchOrganizations: async () => {
        set({ organizationsLoading: true });
        const result = await adminService.getOrganizationsWithCounts();
        if (result.error) {
          set({ organizationsLoading: false });
        } else {
          set({
            organizations: result.data ?? [],
            organizationsLoading: false,
          });
        }
      },
    }),
    { name: "AdminStore" },
  ),
);
