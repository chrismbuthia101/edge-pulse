import type { SupabaseClient } from "@supabase/supabase-js";
import type { Device, DeviceQueryOptions, DeviceSubscriptionCallbacks } from "@/lib/types/devices";
import type { RealtimeDevicePayload } from "@/lib/types/realtime";

export class DeviceRepository {
  private readonly tableName = "devices";

  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async findDevices(
    options: DeviceQueryOptions = {},
  ): Promise<{ data: Device[]; error: Error | null }> {
    try {
      let query = this.supabaseClient
        .from(this.tableName)
        .select(options.select ?? "*");

      if (options.onlineOnly) {
        query = query.in("status", ["online", "gone_silent", "unsynced"]);
      } else if (options.status) {
        query = Array.isArray(options.status)
          ? query.in("status", options.status)
          : query.eq("status", options.status);
      }

      if (options.type) {
        query = Array.isArray(options.type)
          ? query.in("type", options.type)
          : query.eq("type", options.type);
      }

      if (options.risk) {
        query = Array.isArray(options.risk)
          ? query.in("risk", options.risk)
          : query.eq("risk", options.risk);
      }

      if (options.orderBy) {
        query = query.order(options.orderBy.column, {
          ascending: options.orderBy.ascending ?? true,
        });
      }

      if (options.limit) query = query.limit(options.limit);
      if (options.offset !== undefined && options.limit) {
        query = query.range(options.offset, options.offset + options.limit - 1);
      }

      if (options.search) {
        query = query.or(
          `name.ilike.%${options.search}%,ip.ilike.%${options.search}%,os.ilike.%${options.search}%,type.ilike.%${options.search}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return { data: (data ?? []) as unknown as Device[], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find devices"),
      };
    }
  }

  public async findDevicesPaginated(
    options: DeviceQueryOptions & { page: number; limit: number },
  ): Promise<{
    data: {
      data: Device[];
      count: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    } | null;
    error: Error | null;
  }> {
    try {
      const { page, limit, ...queryOptions } = options;
      const offset = (page - 1) * limit;

      const { count, error: countError } = await this.supabaseClient
        .from(this.tableName)
        .select("*", { count: "exact", head: true });

      if (countError) throw countError;

      const { data, error } = await this.findDevices({
        ...queryOptions,
        limit,
        offset,
      });
      if (error) throw error;

      const totalPages = Math.ceil((count ?? 0) / limit);

      return {
        data: {
          data,
          count: count ?? 0,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find devices paginated"),
      };
    }
  }

  public async searchDevices(
    query: string,
    options: DeviceQueryOptions = {},
  ): Promise<{ data: Device[]; error: Error | null }> {
    return this.findDevices({ ...options, search: query });
  }

  public async getById(id: string): Promise<{
    data: Device | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .from(this.tableName)
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return { data: data as unknown as Device | null, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get device"),
      };
    }
  }

  public async getOnlineDevices(): Promise<{ data: Device[]; error: Error | null }> {
    return this.findDevices({
      status: "online",
      orderBy: { column: "name", ascending: true },
    });
  }

  public async getCriticalDevices(): Promise<{ data: Device[]; error: Error | null }> {
    return this.findDevices({
      risk: ["critical", "high"],
      orderBy: { column: "risk", ascending: false },
    });
  }

  public async isolateDevice(id: string): Promise<{
    data: Device | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .from(this.tableName)
        .update({ status: "isolated" as Device["status"] })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { data: data as unknown as Device | null, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to isolate device"),
      };
    }
  }

  public async unisolateDevice(id: string): Promise<{
    data: Device | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .from(this.tableName)
        .update({ status: "online" as Device["status"] })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { data: data as unknown as Device | null, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to unisolate device"),
      };
    }
  }

  public async updateDeviceMetrics(
    id: string,
    metrics: {
      cpuPercent?: number;
      ramPercent?: number;
      syncQueueDepth?: number;
      activelyReporting?: boolean;
    },
  ): Promise<{ data: Device | null; error: Error | null }> {
    try {
      const updates: Record<string, unknown> = {};
      if (metrics.cpuPercent !== undefined)
        updates.cpu_percent = metrics.cpuPercent;
      if (metrics.ramPercent !== undefined)
        updates.ram_percent = metrics.ramPercent;
      if (metrics.syncQueueDepth !== undefined)
        updates.sync_queue_depth = metrics.syncQueueDepth;
      if (metrics.activelyReporting !== undefined)
        updates.actively_reporting = metrics.activelyReporting;

      const { data, error } = await this.supabaseClient
        .from(this.tableName)
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { data: data as unknown as Device | null, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to update device metrics"),
      };
    }
  }

  public async bulkUpdateStatus(
    ids: string[],
    status: Device["status"],
  ): Promise<{ data: Device[]; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseClient
        .from(this.tableName)
        .update({ status })
        .in("id", ids)
        .select();
      if (error) throw error;
      return { data: (data ?? []) as unknown as Device[], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to bulk update device status"),
      };
    }
  }

  public async delete(id: string): Promise<{ data: null; error: Error | null }> {
    try {
      const { error } = await this.supabaseClient
        .from(this.tableName)
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to delete device"),
      };
    }
  }

  public async countWhere(): Promise<{ data: number; error: Error | null }> {
    try {
      const { count, error } = await this.supabaseClient
        .from(this.tableName)
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return { data: count ?? 0, error: null };
    } catch (error) {
      return {
        data: 0,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to count devices"),
      };
    }
  }

  public subscribeToDeviceUpdates(
    callbacks: DeviceSubscriptionCallbacks = {},
  ): string {
    const channel = this.supabaseClient.channel("realtime-devices");

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: this.tableName },
      (payload) => {
        try {
          const p = payload as unknown as RealtimeDevicePayload;
          switch (p.eventType) {
            case "INSERT":
              callbacks.onInsert?.(p.new);
              break;
            case "UPDATE":
              callbacks.onUpdate?.(p.new);
              break;
            case "DELETE":
              callbacks.onDelete?.(p.old as Device);
              break;
          }
        } catch (error) {
          callbacks.onError?.(error);
        }
      },
    );

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" && callbacks.onError) {
        callbacks.onError(new Error("Channel subscription error"));
      }
    });

    return channel.topic;
  }

  public unsubscribeFromDeviceUpdates(channelName?: string): void {
    const topic = channelName ?? "realtime-devices";
    const channel = this.supabaseClient
      .getChannels()
      .find((c) => c.topic === topic);

    if (channel) {
      this.supabaseClient.removeChannel(channel);
    }
  }
}
