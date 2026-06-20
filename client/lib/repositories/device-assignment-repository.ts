import {
  BaseRepository,
  type FilterValue,
  type QueryOptions,
} from "@/lib/repositories/base-repository";

export interface DeviceAssignment {
  id: string;
  user_id: string;
  device_id: string;
  assigned_at: string;
  assigned_by: string | null;
  is_active: boolean;
  organization_id: string;
  device_name?: string;
  device_type?: string;
  device_status?: string;
  device_ip?: string;
  user_name?: string;
}

interface RawDeviceAssignment {
  id: string;
  user_id: string;
  device_id: string;
  assigned_at: string;
  assigned_by: string | null;
  is_active: boolean;
  organization_id: string;
  devices?: {
    name?: string;
    type?: string;
    status?: string;
    ip?: string;
    is_active?: boolean;
  };
  users?: {
    full_name?: string;
  };
}

export interface DeviceAssignmentCreate {
  user_id: string;
  device_id: string;
  assigned_by: string;
}

export interface DeviceAssignmentQueryOptions extends QueryOptions {
  userId?: string;
  deviceId?: string;
  isActive?: boolean;
  assignedBy?: string;
}

export interface DeviceAssignmentSubscriptionCallbacks {
  onInsert?: (assignment: DeviceAssignment) => void;
  onUpdate?: (assignment: DeviceAssignment) => void;
  onDelete?: (assignment: DeviceAssignment) => void;
  onError?: (error: unknown) => void;
}

export class DeviceAssignmentRepository extends BaseRepository<DeviceAssignment> {
  constructor() {
    super("device_assignments");
  }

  async getAssignments(
    options: DeviceAssignmentQueryOptions = {},
  ): Promise<DeviceAssignment[]> {
    const cacheKey =
      options.cacheKey ?? `assignments_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        let query = this.supabase.from(this.tableName).select(`
            id,
            user_id,
            device_id,
            assigned_at,
            assigned_by,
            is_active,
            organization_id,
            devices:device_id (
              name,
              type,
              status,
              ip,
              is_active
            ),
            users:user_id (
              full_name
            )
          `);

        if (options.userId) query = query.eq("user_id", options.userId);
        if (options.deviceId) query = query.eq("device_id", options.deviceId);
        if (options.isActive !== undefined)
          query = query.eq("is_active", options.isActive);
        if (options.assignedBy)
          query = query.eq("assigned_by", options.assignedBy);

        const orderCol = options.orderBy?.column ?? "assigned_at";
        const orderAsc = options.orderBy?.ascending ?? false;
        query = query.order(orderCol, { ascending: orderAsc });

        if (options.limit) query = query.limit(options.limit);

        const { data, error } = await query;
        if (error) throw this.handleError(error);

        return ((data as unknown as RawDeviceAssignment[]) ?? []).map(
          (item) => ({
            id: item.id,
            user_id: item.user_id,
            device_id: item.device_id,
            assigned_at: item.assigned_at,
            assigned_by: item.assigned_by,
            is_active: item.is_active,
            organization_id: item.organization_id,
            device_name: item.devices?.name,
            device_type: item.devices?.type,
            device_status: item.devices?.status,
            device_ip: item.devices?.ip,
            user_name: item.users?.full_name,
          }),
        );
      },
      { ttl: options.cacheTTL },
    );
  }

  async getAssignmentsByUser(userId: string): Promise<DeviceAssignment[]> {
    return this.getAssignments({
      userId,
      isActive: true,
      orderBy: { column: "assigned_at", ascending: false },
      cacheTTL: 60 * 1000,
    });
  }

  async getDeviceAssignments(deviceId: string): Promise<DeviceAssignment[]> {
    return this.getAssignments({
      deviceId,
      isActive: true,
      orderBy: { column: "assigned_at", ascending: false },
      cacheTTL: 60 * 1000,
    });
  }

  async getAllActiveAssignments(): Promise<DeviceAssignment[]> {
    return this.getAssignments({
      isActive: true,
      orderBy: { column: "assigned_at", ascending: false },
      cacheTTL: 30 * 1000,
    });
  }

  async assignDeviceToUser(
    deviceId: string,
    userId: string,
    assignedBy: string,
  ): Promise<DeviceAssignment> {
    const existing = await this.getAssignments({
      userId,
      deviceId,
      isActive: true,
    });
    if (existing.length > 0) {
      throw new Error("Device is already assigned to this user");
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert({
        user_id: userId,
        device_id: deviceId,
        assigned_by: assignedBy,
        assigned_at: new Date().toISOString(),
        is_active: true,
      })
      .select(
        "id, user_id, device_id, assigned_at, assigned_by, is_active, organization_id",
      )
      .single();

    if (error) throw this.handleError(error);
    this.invalidateCache();
    return data as unknown as DeviceAssignment;
  }

  async removeDeviceAssignment(
    deviceId: string,
    userId: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({ is_active: false })
      .eq("device_id", deviceId)
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) throw this.handleError(error);
    this.invalidateCache();
  }

  async reassignDevice(
    deviceId: string,
    fromUserId: string,
    toUserId: string,
    reassignedBy: string,
  ): Promise<DeviceAssignment> {
    await this.removeDeviceAssignment(deviceId, fromUserId);
    return this.assignDeviceToUser(deviceId, toUserId, reassignedBy);
  }

  async getUnassignedDevices(): Promise<
    {
      id: string;
      name: string;
      type: string;
      status: string;
      ip: string;
      is_active: boolean;
    }[]
  > {
    try {
      const { data: allDevices, error: devError } = await this.supabase
        .from("devices")
        .select("id, name, type, status, ip, is_active")
        .eq("is_active", true);

      if (devError) throw devError;

      const { data: activeAssignments, error: assError } = await this.supabase
        .from(this.tableName)
        .select("device_id")
        .eq("is_active", true);

      if (assError) throw assError;

      const assignedIds = new Set(
        (activeAssignments ?? []).map(
          (a: { device_id: string }) => a.device_id,
        ),
      );

      return (allDevices ?? []).filter(
        (d: { id: string }) => !assignedIds.has(d.id),
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getUsersForAssignment(): Promise<
    {
      id: string;
      full_name: string;
      role: string;
    }[]
  > {
    try {
      const { data, error } = await this.supabase
        .schema("organization")
        .from("profiles")
        .select("user_id, role, user:user_id(full_name)")
        .in("role", ["ORG_ANALYST", "ORG_ADMIN"])
        .eq("account_status", "ACTIVE");

      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((p) => {
        const u = (p.user ?? {}) as Record<string, unknown>;
        return {
          id: (u.id ?? p.user_id) as string,
          full_name: (u.full_name ?? "") as string,
          role: p.role as string,
        };
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAssignmentById(
    assignmentId: string,
  ): Promise<DeviceAssignment | null> {
    try {
      const { data, error } = await this.supabase
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
          devices:device_id (name, type, status, ip),
          users:user_id (full_name)
        `,
        )
        .eq("id", assignmentId)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }

      const raw = data as unknown as RawDeviceAssignment;
      return {
        id: raw.id,
        user_id: raw.user_id,
        device_id: raw.device_id,
        assigned_at: raw.assigned_at,
        assigned_by: raw.assigned_by,
        is_active: raw.is_active,
        organization_id: raw.organization_id,
        device_name: raw.devices?.name,
        device_type: raw.devices?.type,
        device_status: raw.devices?.status,
        device_ip: raw.devices?.ip,
        user_name: raw.users?.full_name,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  subscribeToAssignments(
    filters: Record<string, FilterValue> = {},
    callbacks: DeviceAssignmentSubscriptionCallbacks = {},
  ): string {
    const channelName = `realtime-assignments-${Date.now()}`;

    this.subscribe(channelName, filters, (payload: unknown) => {
      try {
        const p = payload as {
          eventType: string;
          new?: DeviceAssignment;
          old?: DeviceAssignment;
        };
        switch (p.eventType) {
          case "INSERT":
            callbacks.onInsert?.(p.new!);
            break;
          case "UPDATE":
            callbacks.onUpdate?.(p.new!);
            break;
          case "DELETE":
            callbacks.onDelete?.(p.old!);
            break;
        }
      } catch (error) {
        callbacks.onError?.(error);
      }
    });

    return channelName;
  }

  unsubscribeFromAssignments(channelName: string): void {
    this.unsubscribe(channelName);
  }

  async getAssignmentStats(): Promise<{
    totalAssignments: number;
    activeAssignments: number;
    unassignedDevices: number;
    usersWithAssignments: number;
  }> {
    try {
      const [assignments, unassignedDevices] = await Promise.all([
        this.getAllActiveAssignments(),
        this.getUnassignedDevices(),
      ]);

      const uniqueUsers = new Set(assignments.map((a) => a.user_id)).size;

      return {
        totalAssignments: assignments.length,
        activeAssignments: assignments.filter((a) => a.is_active).length,
        unassignedDevices: unassignedDevices.length,
        usersWithAssignments: uniqueUsers,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}
