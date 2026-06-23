import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserProfile } from "@/lib/types/user";

export interface UserSubscriptionCallbacks {
  onInsert?: (user: UserProfile) => void;
  onUpdate?: (user: UserProfile) => void;
  onDelete?: (user: UserProfile) => void;
  onError?: (error: Error) => void;
}

export class UserRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  public async findUsers(
    options?: {
      search?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{
    data: UserProfile[];
    error: Error | null;
  }> {
    try {
      let query = this.supabaseClient
        .from("users")
        .select("*");

      if (options?.search) {
        query = query.or(
          `full_name.ilike.%${options.search}%,username.ilike.%${options.search}%`,
        );
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(
          options.offset,
          options.offset + (options.limit ?? 10) - 1,
        );
      }

      const { data, error } = await query;

      if (error) throw error;

      return { data: data ?? [], error: null };
    } catch (error) {
      return {
        data: [],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to find users"),
      };
    }
  }

  public async getUserById(
    id: string,
  ): Promise<{
    data: UserProfile | null;
    error: Error | null;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .from("users")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to get user"),
      };
    }
  }

  public async countWhere(): Promise<{ data: number; error: Error | null }> {
    try {
      const { count, error } = await this.supabaseClient
        .from("users")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return { data: count ?? 0, error: null };
    } catch (error) {
      return {
        data: 0,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to count users"),
      };
    }
  }

  public async createUser(
    data: {
      id: string;
      full_name: string;
      username?: string;
      avatar_url?: string;
    },
  ): Promise<{
    data: UserProfile | null;
    error: Error | null;
  }> {
    try {
      const { data: user, error } = await this.supabaseClient
        .from("users")
        .insert({
          id: data.id,
          full_name: data.full_name,
          username: data.username ?? null,
          avatar_url: data.avatar_url ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return { data: user, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to create user"),
      };
    }
  }

  public async updateUser(
    id: string,
    data: Partial<Pick<UserProfile, "full_name" | "username" | "avatar_url">>,
  ): Promise<{
    data: UserProfile | null;
    error: Error | null;
  }> {
    try {
      const { data: user, error } = await this.supabaseClient
        .from("users")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      return { data: user, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to update user"),
      };
    }
  }

  public async deleteUser(
    id: string,
  ): Promise<{
    data: null;
    error: Error | null;
  }> {
    try {
      const { error } = await this.supabaseClient
        .from("users")
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
            : new Error("Failed to delete user"),
      };
    }
  }

  public subscribeToUserChanges(
    callbacks: UserSubscriptionCallbacks,
  ): string {
    const channel = this.supabaseClient.channel("users-changes");

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "users",
      },
      async (payload) => {
        try {
          if (payload.eventType === "INSERT" && callbacks.onInsert) {
            const result = await this.getUserById(payload.new.id as string);
            if (result.data) callbacks.onInsert(result.data);
          } else if (payload.eventType === "UPDATE" && callbacks.onUpdate) {
            const result = await this.getUserById(payload.new.id as string);
            if (result.data) callbacks.onUpdate(result.data);
          } else if (payload.eventType === "DELETE" && callbacks.onDelete) {
            callbacks.onDelete(
              payload.old as unknown as UserProfile,
            );
          }
        } catch (err) {
          callbacks.onError?.(
            err instanceof Error ? err : new Error(String(err)),
          );
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

  public unsubscribeFromUserChanges(channelName: string): void {
    const channel = this.supabaseClient
      .getChannels()
      .find((c) => c.topic === channelName);

    if (channel) {
      this.supabaseClient.removeChannel(channel);
    }
  }
}
