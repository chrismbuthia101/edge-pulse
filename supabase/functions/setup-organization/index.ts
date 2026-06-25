import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseContext } from "@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SetupRequest {
  org_name: string;
  org_slug: string;
  logo_temp_path?: string;
}

function getExtension(path: string): string {
  const match = path.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return match ? match[1] : "png";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let createdOrgId: string | null = null;

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
    const supabase = ctx.supabaseAdmin;

    const { data: existingProfile, error: profileError } = await supabase
      .schema("organization")
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { status: 404, headers: corsHeaders },
      );
    }

    if (existingProfile?.organization_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Organization already set up",
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    const { org_name, org_slug, logo_temp_path }: SetupRequest =
      await req.json();
    if (!org_name || !org_slug) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "org_name and org_slug required",
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    const { data: existingOrg } = await supabase
      .schema("organization")
      .from("organizations")
      .select("id")
      .eq("slug", org_slug)
      .maybeSingle();

    if (existingOrg) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Organization slug already taken",
        }),
        { status: 409, headers: corsHeaders },
      );
    }

    const { data: org, error: orgError } = await supabase
      .schema("organization")
      .from("organizations")
      .insert({
        name: org_name,
        slug: org_slug,
      })
      .select()
      .single();

    if (orgError || !org) {
      console.error("Organization creation error:", orgError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to create organization",
        }),
        { status: 500, headers: corsHeaders },
      );
    }

    createdOrgId = org.id;

    const { error: billingError } = await supabase
      .schema("organization")
      .from("billing")
      .insert({
        organization_id: org.id,
        plan_tier: "trial",
      });
    if (billingError) {
      console.error("Billing insert error:", billingError);
    }

    // ── Logo: move from temp to permanent path ──────────────────────────
    let logo_url: string | null = null;
    if (logo_temp_path) {
      try {
        const ext = getExtension(logo_temp_path);
        const uuid = crypto.randomUUID();
        const newPath = `${org.id}/${uuid}.${ext}`;

        const { error: moveError } = await supabase.storage
          .from("org-logos")
          .move(logo_temp_path, newPath);

        if (moveError) {
          console.error("Logo move error:", moveError);
          await supabase.storage
            .from("org-logos")
            .remove([logo_temp_path])
            .catch(() => {});
        } else {
          const { data: fileData, error: downloadError } =
            await supabase.storage.from("org-logos").download(newPath);

          if (downloadError || !fileData) {
            console.error("Logo download error:", downloadError);
            await supabase.storage
              .from("org-logos")
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
                .from("org-logos")
                .remove([newPath])
                .catch(() => {});
              console.error("Logo validation failed: invalid file signature");
            } else {
              logo_url = `${supabaseUrl}/storage/v1/object/public/org-logos/${newPath}`;

              const { error: logoUpdateError } = await supabase
                .schema("organization")
                .from("organizations")
                .update({ logo_url })
                .eq("id", org.id);

              if (logoUpdateError) {
                console.error("Logo URL update error:", logoUpdateError);
              }
            }
          }
        }
      } catch (logoError) {
        console.error("Logo processing error:", logoError);
      }
    }

    const { error: userInsertError } = await supabase
      .from("users")
      .insert({ id: user.id, full_name: user.email?.split("@")[0] ?? "Admin" })
      .onConflict("id")
      .ignore()
      .select();
    if (userInsertError) {
      console.error("User insert error:", userInsertError);
    }

    const { error: profileInsertError } = await supabase
      .schema("organization")
      .from("profiles")
      .insert({
        user_id: user.id,
        organization_id: org.id,
        role: "ORG_ADMIN",
        account_status: "ACTIVE",
      });

    if (profileInsertError) {
      await supabase
        .schema("organization")
        .from("organizations")
        .delete()
        .eq("id", org.id);
      console.error("Profile insert error:", profileInsertError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to assign organization",
        }),
        { status: 500, headers: corsHeaders },
      );
    }

    await supabase
      .schema("internal")
      .from("audit_logs")
      .insert({
        user_id: user.id,
        action: "ORG_CREATED",
        resource_type: "organization",
        resource_id: org.id,
        new_values: { name: org_name, slug: org_slug, logo_url },
        severity: "INFO",
        organization_id: org.id,
      });

    return new Response(
      JSON.stringify({
        success: true,
        organization_id: org.id,
        logo_url,
        message: "Organization created successfully.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Setup organization error:", error);
    if (createdOrgId) {
      const SUPABASE_SECRET_KEYS = JSON.parse(
        Deno.env.get("SUPABASE_SECRET_KEYS")!,
      );
      const cleanupSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        SUPABASE_SECRET_KEYS["default"],
      );
      await cleanupSupabase
        .schema("organization")
        .from("organizations")
        .delete()
        .eq("id", createdOrgId)
        .catch(() => {});
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: corsHeaders },
    );
  }
});
