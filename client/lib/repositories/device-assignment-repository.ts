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
  analyst_email?: string;
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
    email?: string;
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

  private buildAssignmentQuery(options: DeviceAssignmentQueryOptions = {}) {
    const standardFilters: Record<string, unknown> = {};

    if (options.analystId) standardFilters.analyst_id = options.analystId;
    if (options.deviceId) standardFilters.device_id = options.deviceId;
    if (options.isActive !== undefined) standardFilters.is_active = options.isActive;
    if (options.assignedBy) standardFilters.assigned_by = options.assignedBy;

    let query = this.buildQuery({
      filters: standardFilters,
      orderBy: options.orderBy || { column: 'assigned_at', ascending: false },
      limit: options.limit,
      offset: options.offset,
    });

    // Always join with device and analyst details
    query = query.select(`
      *,
      device_registry:device_id (
        name,
        type,
        status,
        ip,
        is_active
      ),
      analyst_users:analyst_id (
        full_name,
        email,
        is_active
      )
    `);

    return query;
  }

  async getAssignments(options: DeviceAssignmentQueryOptions = {}): Promise<DeviceAssignment[]> {
    const cacheKey = options.cacheKey ?? `assignments_${JSON.stringify(options)}`;

    return this.cachedQuery(
      cacheKey,
      async () => {
        const { data, error } = await this.buildAssignmentQuery(options);
        if (error) throw this.handleError(error);

        // Transform the data to match our interface
        const rawData = data as unknown as RawDeviceAssignment[];
        const transformedData = (rawData || []).map((item: RawDeviceAssignment) => {
          const assignment: DeviceAssignment = {
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
            analyst_email: item.analyst_users?.email,
          };
          return assignment;
        });

        return transformedData;
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
    const existing = await this.getAssignments({
      analystId,
      deviceId,
      isActive: true,
    });

    if (existing.length > 0) {
      throw new Error('Device is already assigned to this analyst');
    }

    const now = new Date().toISOString();
    return this.create({
      analyst_id: analystId,
      device_id: deviceId,
      assigned_by: assignedBy,
      assigned_at: now,
      is_active: true,
    } as DeviceAssignmentCreate);
  }

  async removeDeviceAssignment(
    deviceId: string,
    analystId: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('analyst_device_assignments')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('device_id', deviceId)
      .eq('analyst_id', analystId)
      .eq('is_active', true);

    if (error) throw this.handleError(error);
  }

  async reassignDevice(
    deviceId: string,
    fromAnalystId: string,
    toAnalystId: string,
    reassignedBy: string
  ): Promise<DeviceAssignment> {
    // Remove old assignment
    await this.removeDeviceAssignment(deviceId, fromAnalystId);

    // Create new assignment
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
      const { data, error } = await this.supabase
        .from('device_registry')
        .select(`
          *,
          analyst_device_assignments (
            analyst_id,
            is_active
          )
        `)
        .eq('is_active', true);

      if (error) throw error;

      // Filter devices that have no active assignments
      return (data || []).filter((device: {
        analyst_device_assignments?: Array<{
          analyst_id: string;
          is_active: boolean;
        }>;
      }) =>
        !device.analyst_device_assignments ||
        device.analyst_device_assignments.length === 0 ||
        !device.analyst_device_assignments.some((assignment) => assignment.is_active)
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAnalystsForAssignment(): Promise<{
    user_id: string;
    full_name: string;
    email: string;
    department: string | null;
  }[]> {
    try {
      const { data, error } = await this.supabase
        .from('analyst_users')
        .select('user_id, full_name, email, department')
        .eq('role', 'ANALYST')
        .eq('is_active', true)
        .eq('approval_status', 'APPROVED')
        .order('full_name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAssignmentById(assignmentId: string): Promise<DeviceAssignment | null> {
    try {
      const { data, error } = await this.supabase
        .from('device_assignment_details')
        .select('*')
        .eq('assignment_id', assignmentId)
        .single();

      if (error) throw error;
      return data as DeviceAssignment;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Realtime subscriptions
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
          case 'INSERT':
            callbacks.onInsert?.(p.new!);
            break;
          case 'UPDATE':
            callbacks.onUpdate?.(p.new!);
            break;
          case 'DELETE':
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

  // Analytics and reporting methods
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
