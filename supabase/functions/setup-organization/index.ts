import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

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

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        { status: 405, headers: corsHeaders },
      );
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseSecretKey = Deno.env.get("SB_SECRET_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseSecretKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authentication" }),
        { status: 401, headers: corsHeaders },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("id, role, account_status, organization_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { status: 404, headers: corsHeaders },
      );
    }

    if (profile.organization_id) {
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

    await supabase.schema("organization").from("billing").insert({
      organization_id: org.id,
      plan_tier: "trial",
    });

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
      } catch (logoError) {
        console.error("Logo processing error:", logoError);
      }
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({
        organization_id: org.id,
        role: "ORG_ADMIN",
        account_status: "ACTIVE",
      })
      .eq("id", user.id);

    if (updateError) {
      await supabase
        .schema("organization")
        .from("organizations")
        .delete()
        .eq("id", org.id);
      console.error("User update error:", updateError);
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
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
