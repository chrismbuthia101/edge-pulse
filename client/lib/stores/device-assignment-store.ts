import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DeviceAssignmentRepository } from "@/lib/repositories/device-assignment-repository";
import type { DeviceAssignment } from "@/lib/types/devices";
import { createClient } from "@/lib/config/client";
import { toast } from "sonner";

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  ip: string;
  is_active: boolean;
}

interface Analyst {
  id: string;
  full_name: string;
  role: string;
}

interface AssignmentStats {
  totalAssignments: number;
  activeAssignments: number;
  unassignedDevices: number;
  usersWithAssignments: number;
}

const initialState = {
  assignments: [] as DeviceAssignment[],
  unassignedDevices: [] as Device[],
  analysts: [] as Analyst[],
  assignmentStats: null as AssignmentStats | null,
  loading: false,
  error: null as string | null,
};

let repository: DeviceAssignmentRepository | null = null;
function getRepository(): DeviceAssignmentRepository {
  if (!repository) {
    repository = new DeviceAssignmentRepository(createClient());
  }
  return repository;
}

type DeviceAssignmentStore = typeof initialState & {
  initialize: (supabaseClient: SupabaseClient) => void;
  loadData: () => Promise<void>;
  assignDevice: (deviceId: string, analystId: string, assignedBy: string) => Promise<void>;
  removeAssignment: (deviceId: string, analystId: string) => Promise<void>;
  reassignDevice: (deviceId: string, fromAnalystId: string, toAnalystId: string, reassignedBy: string) => Promise<void>;
};

export const useDeviceAssignmentStore = create<DeviceAssignmentStore>()(
  devtools(
    (set) => ({
      ...initialState,

      initialize: (supabaseClient: SupabaseClient) => {
        repository = new DeviceAssignmentRepository(supabaseClient);
      },

      loadData: async () => {
        set({ loading: true, error: null });
        try {
          const repo = getRepository();
          const [assignmentsResult, devicesResult, analystsResult, statsResult] =
            await Promise.all([
              repo.getAllActiveAssignments(),
              repo.getUnassignedDevices(),
              repo.getUsersForAssignment(),
              repo.getAssignmentStats(),
            ]);

          if (assignmentsResult.error) throw assignmentsResult.error;
          if (devicesResult.error) throw devicesResult.error;
          if (analystsResult.error) throw analystsResult.error;
          if (statsResult.error) throw statsResult.error;

          set({
            assignments: assignmentsResult.data,
            unassignedDevices: devicesResult.data,
            analysts: analystsResult.data,
            assignmentStats: statsResult.data,
            loading: false,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to load assignment data";
          set({ error: message, loading: false });
          toast.error(message);
        }
      },

      assignDevice: async (deviceId, analystId, assignedBy) => {
        try {
          await getRepository().assignDeviceToUser(deviceId, analystId, assignedBy);
          toast.success("Device assigned successfully");
          set({ loading: true });
          const repo = getRepository();
          const [assignmentsResult, devicesResult, statsResult] = await Promise.all([
            repo.getAllActiveAssignments(),
            repo.getUnassignedDevices(),
            repo.getAssignmentStats(),
          ]);

          if (assignmentsResult.error) throw assignmentsResult.error;
          if (devicesResult.error) throw devicesResult.error;
          if (statsResult.error) throw statsResult.error;

          set({
            assignments: assignmentsResult.data,
            unassignedDevices: devicesResult.data,
            assignmentStats: statsResult.data,
            loading: false,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to assign device";
          set({ loading: false });
          toast.error(message);
        }
      },

      removeAssignment: async (deviceId, analystId) => {
        try {
          await getRepository().removeDeviceAssignment(deviceId, analystId);
          toast.success("Device assignment removed");
          set({ loading: true });
          const repo = getRepository();
          const [assignmentsResult, devicesResult, statsResult] = await Promise.all([
            repo.getAllActiveAssignments(),
            repo.getUnassignedDevices(),
            repo.getAssignmentStats(),
          ]);

          if (assignmentsResult.error) throw assignmentsResult.error;
          if (devicesResult.error) throw devicesResult.error;
          if (statsResult.error) throw statsResult.error;

          set({
            assignments: assignmentsResult.data,
            unassignedDevices: devicesResult.data,
            assignmentStats: statsResult.data,
            loading: false,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to remove assignment";
          set({ loading: false });
          toast.error(message);
        }
      },

      reassignDevice: async (deviceId, fromAnalystId, toAnalystId, reassignedBy) => {
        try {
          await getRepository().reassignDevice(deviceId, fromAnalystId, toAnalystId, reassignedBy);
          toast.success("Device reassigned successfully");
          set({ loading: true });
          const repo = getRepository();
          const [assignmentsResult, devicesResult, statsResult] = await Promise.all([
            repo.getAllActiveAssignments(),
            repo.getUnassignedDevices(),
            repo.getAssignmentStats(),
          ]);

          if (assignmentsResult.error) throw assignmentsResult.error;
          if (devicesResult.error) throw devicesResult.error;
          if (statsResult.error) throw statsResult.error;

          set({
            assignments: assignmentsResult.data,
            unassignedDevices: devicesResult.data,
            assignmentStats: statsResult.data,
            loading: false,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to reassign device";
          set({ loading: false });
          toast.error(message);
        }
      },
    }),
    { name: "DeviceAssignmentStore" },
  ),
);
