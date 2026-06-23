import { SupabaseClient } from "@supabase/supabase-js";

export class StorageRepository {
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  public async uploadFile(
    bucket: string,
    path: string,
    file: File,
    options?: { upsert?: boolean; contentType?: string },
  ): Promise<{ path: string | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .upload(path, file, {
          upsert: options?.upsert ?? true,
          contentType: options?.contentType,
        });
      if (error) throw error;
      return { path: data?.path ?? null, error: null };
    } catch (error) {
      return {
        path: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to upload file"),
      };
    }
  }

  public getPublicUrl(bucket: string, path: string): string {
    const { data } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    return data.publicUrl;
  }

  public async deleteFile(
    bucket: string,
    path: string,
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.storage
        .from(bucket)
        .remove([path]);
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error
            : new Error("Failed to delete file"),
      };
    }
  }
}
