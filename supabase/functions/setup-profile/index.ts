import { serve } from "std/http/server.ts";
import { createSupabaseContext } from "@supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SetupProfileRequest {
  username: string;
  full_name: string;
  avatar_temp_path?: string;
}

function getExtension(path: string): string {
  const match = path.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return match ? match[1] : "png";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let supabase: SupabaseClient;

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        { status: 405, headers: corsHeaders },
      );
    }

    const { data: ctx, error: authError } = await createSupabaseContext(req, {
      auth: "user",
    });
    if (authError) {
      return new Response(
        JSON.stringify({ success: false, error: authError.message }),
        { status: authError.status, headers: corsHeaders },
      );
    }

    const user = { id: ctx.userClaims!.id!, email: ctx.userClaims!.email! };
    supabase = ctx.supabaseAdmin;

    const { data: pendingProfiles, error: profileError } = await supabase
      .schema("organization")
      .from("profiles")
      .select("id, organization_id, account_status")
      .eq("user_id", user.id)
      .eq("account_status", "PENDING");

    if (profileError || !pendingProfiles || pendingProfiles.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No pending profile found" }),
        { status: 404, headers: corsHeaders },
      );
    }

    const pendingProfile = pendingProfiles[0];

    const { username, full_name, avatar_temp_path }: SetupProfileRequest =
      await req.json();

    if (!username) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "username is required",
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    let avatar_url: string | null = null;
    if (avatar_temp_path) {
      try {
        const ext = getExtension(avatar_temp_path);
        const uuid = crypto.randomUUID();
        const newPath = `${user.id}/${uuid}.${ext}`;

        const { error: moveError } = await supabase.storage
          .from("avatars")
          .move(avatar_temp_path, newPath);

        if (moveError) {
          console.error("Avatar move error:", moveError);
          await supabase.storage
            .from("avatars")
            .remove([avatar_temp_path])
            .catch(() => {});
        } else {
          const { data: fileData, error: downloadError } =
            await supabase.storage.from("avatars").download(newPath);

          if (downloadError || !fileData) {
            console.error("Avatar download error:", downloadError);
            await supabase.storage
              .from("avatars")
              .remove([newPath])
              .catch(() => {});
          } else {
            const bytes = await fileData.arrayBuffer();
            const header = new Uint8Array(bytes.slice(0, 8));

            const isPng =
              header[0] === 0x89 &&
              header[1] === 0x50 &&
              header[2] === 0x4e &&
              header[3] === 0x47;

            const isJpeg =
              header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;

            if (!isPng && !isJpeg) {
              await supabase.storage
                .from("avatars")
                .remove([newPath])
                .catch(() => {});
              console.error("Avatar validation failed: invalid file signature");
            } else {
              const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
              avatar_url = `${supabaseUrl}/storage/v1/object/public/avatars/${newPath}`;
            }
          }
        }
      } catch (avatarError) {
        console.error("Avatar processing error:", avatarError);
      }
    }

    const { error: userUpdateError } = await supabase
      .from("users")
      .update({
        full_name,
        username,
        avatar_url,
      })
      .eq("id", user.id);

    if (userUpdateError) {
      console.error("User update error:", userUpdateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update user" }),
        { status: 500, headers: corsHeaders },
      );
    }

    const { error: activateError } = await supabase
      .schema("organization")
      .from("profiles")
      .update({ account_status: "ACTIVE" })
      .eq("id", pendingProfile.id);

    if (activateError) {
      console.error("Profile activation error:", activateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to activate profile",
        }),
        { status: 500, headers: corsHeaders },
      );
    }

    await supabase
      .schema("internal")
      .from("audit_logs")
      .insert({
        user_id: user.id,
        action: "PROFILE_SETUP_COMPLETED",
        resource_type: "users",
        resource_id: user.id,
        new_values: { full_name, username, avatar_url },
        severity: "INFO",
        organization_id: pendingProfile.organization_id,
      });

    return new Response(
      JSON.stringify({
        success: true,
        avatar_url,
        message: "Profile setup completed successfully.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Setup profile error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: corsHeaders },
    );
  }
});
