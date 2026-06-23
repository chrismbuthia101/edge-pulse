import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeviceAssignment
} from "@/lib/types/devices";

interface DeviceWithAssignment {
  id: string;
  name: string;
  type: string;
  status: string;
  ip: string;
  is_active: boolean;
}

interface AnalystWithAssignment {
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

export class DeviceAssignmentRepository {
  private readonly tableName = "device_assignments";

  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async getAssignmentsByUser(
    userId: string,
  ): Promise<{ data: DeviceAssignment[]; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .from(this.tableName)
        .select(
          `
            id,
            user_id,
            device_id,
            assigned_at,
            assigned_by,
            is_active,
            organization_id,
            devices:device_id (name, type, status, ip, is_active),
            users:user_id (full_name)
          `,
        )
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("assigned_at", { ascending: false });

      if (error) throw error;

      return {
        data: ((data ?? []) as Array<Record<string, unknown>>).map(
          (item) => {
            const devices = item.devices as Record<string, unknown> | undefined;
            const users = item.users as Record<string, unknown> | undefined;
            return {
              id: item.id as string,
              user_id: item.user_id as string,
              device_id: item.device_id as string,
              assigned_at: item.assigned_at as string,
              assigned_by: item.assigned_by as string | null,
              is_active: item.is_active as boolean,
              organization_id: item.organization_id as string,
              device_name: devices?.name as string | undefined,
              device_type: devices?.type as string | undefined,
              device_status: devices?.status as string | undefined,
              device_ip: devices?.ip as string | undefined,
              user_name: users?.full_name as string | undefined,
            } as DeviceAssignment;
          },
        ),
        error: null,
      };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get assignments by user"),
      };
    }
  }

  public async getAllActiveAssignments(): Promise<{
    data: DeviceAssignment[];
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .from(this.tableName)
        .select(
          `
            id,
            user_id,
            device_id,
            assigned_at,
            assigned_by,
            is_active,
            organization_id,
            devices:device_id (name, type, status, ip, is_active),
            users:user_id (full_name)
          `,
        )
        .eq("is_active", true)
        .order("assigned_at", { ascending: false });

      if (error) throw error;

      return {
        data: ((data ?? []) as Array<Record<string, unknown>>).map(
          (item) => {
            const devices = item.devices as Record<string, unknown> | undefined;
            const users = item.users as Record<string, unknown> | undefined;
            return {
              id: item.id as string,
              user_id: item.user_id as string,
              device_id: item.device_id as string,
              assigned_at: item.assigned_at as string,
              assigned_by: item.assigned_by as string | null,
              is_active: item.is_active as boolean,
              organization_id: item.organization_id as string,
              device_name: devices?.name as string | undefined,
              device_type: devices?.type as string | undefined,
              device_status: devices?.status as string | undefined,
              device_ip: devices?.ip as string | undefined,
              user_name: users?.full_name as string | undefined,
            } as DeviceAssignment;
          },
        ),
        error: null,
      };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get active assignments"),
      };
    }
  }

  public async getUnassignedDevices(): Promise<{
    data: DeviceWithAssignment[];
    error: Error | null;
  }> {
    try {
      const { data: assigned, error: assignError } = await this.supabaseClient
        .from(this.tableName)
        .select("device_id")
        .eq("is_active", true);

      if (assignError) throw assignError;

      const assignedIds = new Set(
        (assigned ?? []).map((a: { device_id: string }) => a.device_id),
      );

      const { data: devices, error: devicesError } = await this.supabaseClient
        .from("devices")
        .select("id, name, type, status, ip, is_active")
        .not("status", "eq", "isolated");

      if (devicesError) throw devicesError;

      const unassigned = ((devices ?? []) as DeviceWithAssignment[]).filter(
        (d) => !assignedIds.has(d.id),
      );

      return { data: unassigned, error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get unassigned devices"),
      };
    }
  }

  public async getUsersForAssignment(): Promise<{
    data: AnalystWithAssignment[];
    error: Error | null;
  }> {
    try {
      const { data: admins, error: adminError } = await this.supabaseClient
        .from("organization_profiles")
        .select("user_id")
        .eq("role", "ORG_ADMIN");

      if (adminError) throw adminError;

      const { data: profiles, error: profilesError } = await this.supabaseClient
        .from("organization_profiles")
        .select(
          "user_id, organization_id, role, users:user_id!inner(full_name)",
        )
        .eq("role", "ORG_ANALYST")
        .eq("account_status", "ACTIVE");

      if (profilesError) throw profilesError;

      const adminUserIds = new Set(
        (admins ?? []).map((a: { user_id: string }) => a.user_id),
      );

      const analysts = (profiles ?? [])
        .filter(
          (p: Record<string, unknown>) =>
            !adminUserIds.has(p.user_id as string),
        )
        .map(
          (p: Record<string, unknown>) => {
            const users = p.users as { full_name?: string } | undefined;
            return {
              id: p.user_id as string,
              full_name: users?.full_name ?? "Unknown",
              role: p.role as string,
            } as AnalystWithAssignment;
          },
        );

      return { data: analysts, error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get users for assignment"),
      };
    }
  }

  public async getAssignmentStats(): Promise<{
    data: AssignmentStats | null;
    error: Error | null;
  }> {
    try {
      const { count: totalCount, error: totalError } =
        await this.supabaseClient
          .from(this.tableName)
          .select("*", { count: "exact", head: true });

      if (totalError) throw totalError;

      const { count: activeCount, error: activeError } =
        await this.supabaseClient
          .from(this.tableName)
          .select("*", { count: "exact", head: true })
          .eq("is_active", true);

      if (activeError) throw activeError;

      const { data: devices, error: devicesError } = await this.supabaseClient
        .from("devices")
        .select("id")
        .not("status", "eq", "isolated");

      if (devicesError) throw devicesError;

      const { data: assigned, error: assignedError } =
        await this.supabaseClient
          .from(this.tableName)
          .select("device_id")
          .eq("is_active", true);

      if (assignedError) throw assignedError;

      const assignedIds = new Set(
        (assigned ?? []).map((a: { device_id: string }) => a.device_id),
      );

      const { data: usersWithAssignments, error: usersError } =
        await this.supabaseClient
          .from(this.tableName)
          .select("user_id")
          .eq("is_active", true);

      if (usersError) throw usersError;

      const uniqueUsers = new Set(
        (usersWithAssignments ?? []).map(
          (u: { user_id: string }) => u.user_id,
        ),
      );

      return {
        data: {
          totalAssignments: totalCount ?? 0,
          activeAssignments: activeCount ?? 0,
          unassignedDevices: (devices ?? []).length - assignedIds.size,
          usersWithAssignments: uniqueUsers.size,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get assignment stats"),
      };
    }
  }

  public async assignDeviceToUser(
    deviceId: string,
    userId: string,
    assignedBy: string,
  ): Promise<{ data: DeviceAssignment | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .from(this.tableName)
        .insert({
          user_id: userId,
          device_id: deviceId,
          assigned_by: assignedBy,
          is_active: true,
        })
        .select(
          "id, user_id, device_id, assigned_at, assigned_by, is_active, organization_id",
        )
        .single();

      if (error) throw error;
      return { data: data as unknown as DeviceAssignment, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to assign device to user"),
      };
    }
  }

  public async removeDeviceAssignment(
    deviceId: string,
    userId: string,
  ): Promise<{ data: null; error: Error | null }> {
    try {
      const { error } = await this.supabaseClient
        .from(this.tableName)
        .update({ is_active: false })
        .eq("device_id", deviceId)
        .eq("user_id", userId)
        .eq("is_active", true);

      if (error) throw error;
      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to remove device assignment"),
      };
    }
  }

  public async reassignDevice(
    deviceId: string,
    fromUserId: string,
    toUserId: string,
    reassignedBy: string,
  ): Promise<{ data: DeviceAssignment | null; error: Error | null }> {
    try {
      const { error: removeError } = await this.removeDeviceAssignment(
        deviceId,
        fromUserId,
      );
      if (removeError) throw removeError;

      return this.assignDeviceToUser(deviceId, toUserId, reassignedBy);
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to reassign device"),
      };
    }
  }
}
