import {
  BaseRepository,
  type QueryOptions,
} from '@/lib/repositories/base-repository';

export interface DeviceAssignment {
  assignment_id: string;
  analyst_id: string;
  device_id: string;
  assigned_at: string;
  assigned_by: string | null;
  is_active: boolean;
  device_name?: string;
  device_type?: string;
  device_status?: string;
  device_ip?: string;
  analyst_name?: string;
}

interface RawDeviceAssignment {
  assignment_id: string;
  analyst_id: string;
  device_id: string;
  assigned_at: string;
  assigned_by: string | null;
  is_active: boolean;
  device_registry?: {
    name?: string;
    type?: string;
    status?: string;
    ip?: string;
    is_active?: boolean;
  };
  analyst_users?: {
    full_name?: string;
    is_active?: boolean;
  };
}

export interface DeviceAssignmentCreate {
  analyst_id: string;
  device_id: string;
  assigned_by: string;
}

export interface DeviceAssignmentQueryOptions extends QueryOptions {
  analystId?: string;
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
    super('analyst_device_assignments');
  }

  async getAssignments(options: DeviceAssignmentQueryOptions = {}): Promise<DeviceAssignment[]> {
    const cacheKey = options.cacheKey ?? `assignments_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        let query = this.supabase
          .from(this.tableName)
          .select(`
            assignment_id,
            analyst_id,
            device_id,
            assigned_at,
            assigned_by,
            is_active,
            device_registry:device_id (
              name,
              type,
              status,
              ip,
              is_active
            ),
            analyst_users:analyst_id (
              full_name,
              is_active
            )
          `);

        if (options.analystId) query = query.eq('analyst_id', options.analystId);
        if (options.deviceId) query = query.eq('device_id', options.deviceId);
        if (options.isActive !== undefined) query = query.eq('is_active', options.isActive);
        if (options.assignedBy) query = query.eq('assigned_by', options.assignedBy);

        const orderCol = options.orderBy?.column ?? 'assigned_at';
        const orderAsc = options.orderBy?.ascending ?? false;
        query = query.order(orderCol, { ascending: orderAsc });

        if (options.limit) query = query.limit(options.limit);

        const { data, error } = await query;
        if (error) throw this.handleError(error);

        return (data as unknown as RawDeviceAssignment[] ?? []).map((item) => ({
          assignment_id: item.assignment_id,
          analyst_id: item.analyst_id,
          device_id: item.device_id,
          assigned_at: item.assigned_at,
          assigned_by: item.assigned_by,
          is_active: item.is_active,
          device_name: item.device_registry?.name,
          device_type: item.device_registry?.type,
          device_status: item.device_registry?.status,
          device_ip: item.device_registry?.ip,
          analyst_name: item.analyst_users?.full_name,
        }));
      },
      options.cacheTTL
    );
  }

  async getAnalystDevices(analystId: string): Promise<DeviceAssignment[]> {
    return this.getAssignments({
      analystId,
      isActive: true,
      orderBy: { column: 'assigned_at', ascending: false },
      cacheTTL: 60 * 1000,
    });
  }

  async getDeviceAssignments(deviceId: string): Promise<DeviceAssignment[]> {
    return this.getAssignments({
      deviceId,
      isActive: true,
      orderBy: { column: 'assigned_at', ascending: false },
      cacheTTL: 60 * 1000,
    });
  }

  async getAllActiveAssignments(): Promise<DeviceAssignment[]> {
    return this.getAssignments({
      isActive: true,
      orderBy: { column: 'assigned_at', ascending: false },
      cacheTTL: 30 * 1000,
    });
  }

  async assignDeviceToAnalyst(
    deviceId: string,
    analystId: string,
    assignedBy: string
  ): Promise<DeviceAssignment> {
    // Check if assignment already exists
    const existing = await this.getAssignments({ analystId, deviceId, isActive: true });
    if (existing.length > 0) {
      throw new Error('Device is already assigned to this analyst');
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert({
        analyst_id: analystId,
        device_id: deviceId,
        assigned_by: assignedBy,
        assigned_at: new Date().toISOString(),
        is_active: true,
      })
      .select('assignment_id, analyst_id, device_id, assigned_at, assigned_by, is_active')
      .single();

    if (error) throw this.handleError(error);
    this.invalidateCache();
    return data as unknown as DeviceAssignment;
  }

  async removeDeviceAssignment(deviceId: string, analystId: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({ is_active: false })
      .eq('device_id', deviceId)
      .eq('analyst_id', analystId)
      .eq('is_active', true);

    if (error) throw this.handleError(error);
    this.invalidateCache();
  }

  async reassignDevice(
    deviceId: string,
    fromAnalystId: string,
    toAnalystId: string,
    reassignedBy: string
  ): Promise<DeviceAssignment> {
    await this.removeDeviceAssignment(deviceId, fromAnalystId);
    return this.assignDeviceToAnalyst(deviceId, toAnalystId, reassignedBy);
  }

  async getUnassignedDevices(): Promise<{
    id: string;
    name: string;
    type: string;
    status: string;
    ip: string;
    is_active: boolean;
  }[]> {
    try {

      const { data: allDevices, error: devError } = await this.supabase
        .from('device_registry')
        .select('id, name, type, status, ip, is_active')
        .eq('is_active', true);

      if (devError) throw devError;

      const { data: activeAssignments, error: assError } = await this.supabase
        .from(this.tableName)
        .select('device_id')
        .eq('is_active', true);

      if (assError) throw assError;

      const assignedIds = new Set((activeAssignments ?? []).map((a: { device_id: string }) => a.device_id));

      return (allDevices ?? []).filter((d: { id: string }) => !assignedIds.has(d.id));
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAnalystsForAssignment(): Promise<{
    user_id: string;
    full_name: string;
    department: string | null;
  }[]> {
    try {
      const { data, error } = await this.supabase
        .from('analyst_users')
        .select('user_id, full_name, department')
        .eq('role', 'ANALYST')
        .eq('is_active', true)
        .eq('approval_status', 'APPROVED')
        .order('full_name');

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAssignmentById(assignmentId: string): Promise<DeviceAssignment | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select(`
          assignment_id,
          analyst_id,
          device_id,
          assigned_at,
          assigned_by,
          is_active,
          device_registry:device_id (name, type, status, ip),
          analyst_users:analyst_id (full_name)
        `)
        .eq('assignment_id', assignmentId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      const raw = data as unknown as RawDeviceAssignment;
      return {
        assignment_id: raw.assignment_id,
        analyst_id: raw.analyst_id,
        device_id: raw.device_id,
        assigned_at: raw.assigned_at,
        assigned_by: raw.assigned_by,
        is_active: raw.is_active,
        device_name: raw.device_registry?.name,
        device_type: raw.device_registry?.type,
        device_status: raw.device_registry?.status,
        device_ip: raw.device_registry?.ip,
        analyst_name: raw.analyst_users?.full_name,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  subscribeToAssignments(
    filters: Partial<DeviceAssignmentQueryOptions> = {},
    callbacks: DeviceAssignmentSubscriptionCallbacks = {}
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
          case 'INSERT': callbacks.onInsert?.(p.new!); break;
          case 'UPDATE': callbacks.onUpdate?.(p.new!); break;
          case 'DELETE': callbacks.onDelete?.(p.old!); break;
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
    analystsWithAssignments: number;
  }> {
    try {
      const [assignments, unassignedDevices] = await Promise.all([
        this.getAllActiveAssignments(),
        this.getUnassignedDevices(),
      ]);

      const uniqueAnalysts = new Set(assignments.map(a => a.analyst_id)).size;

      return {
        totalAssignments: assignments.length,
        activeAssignments: assignments.filter(a => a.is_active).length,
        unassignedDevices: unassignedDevices.length,
        analystsWithAssignments: uniqueAnalysts,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}