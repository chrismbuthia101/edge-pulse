// EdgePulse Invite Analyst Function v1.1.0
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseContext } from "@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_INVITES = 100;

interface SingleInvite {
  email: string;
  full_name: string;
}

interface InviteRequest {
  email?: string;
  full_name?: string;
  invites?: SingleInvite[];
}

interface InviteResult {
  email: string;
  success: boolean;
  user_id?: string;
  invite_link?: string;
  error?: string;
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

    const { data: inviterProfile, error: userError } = await supabase
      .schema("organization")
      .from("profiles")
      .select("user_id, organization_id, role, account_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (userError || !inviterProfile) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { status: 404, headers: corsHeaders },
      );
    }

    if (
      inviterProfile.role !== "ORG_ADMIN" ||
      inviterProfile.account_status !== "ACTIVE"
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient permissions" }),
        { status: 403, headers: corsHeaders },
      );
    }

    if (!inviterProfile.organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: "No organization associated" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const body: InviteRequest = await req.json();

    const invitesToProcess: SingleInvite[] = [];
    if (body.email && body.full_name) {
      invitesToProcess.push({ email: body.email, full_name: body.full_name });
    } else if (body.invites && Array.isArray(body.invites)) {
      invitesToProcess.push(...body.invites);
    }

    if (invitesToProcess.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Provide email/full_name or an invites array",
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    if (invitesToProcess.length > MAX_INVITES) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Maximum ${MAX_INVITES} invites per request`,
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    const appUrl =
      Deno.env.get("PUBLIC_APP_URL") || "https://app.edgepulse.dev";

    const authResults = await Promise.allSettled(
      invitesToProcess.map(async (invite) => {
        const { data, error } = await supabase.auth.admin.generateLink({
          type: "invite",
          email: invite.email,
          options: {
            redirectTo: `${appUrl}/accept-invite`,
            data: {
              invited_by: user.id,
              organization_id: inviterProfile.organization_id,
            },
          },
        });
        if (error || !data.user) {
          return {
            email: invite.email,
            full_name: invite.full_name,
            error: error?.message || "Email may already be registered.",
          };
        }
        return {
          email: invite.email,
          full_name: invite.full_name,
          userId: data.user.id,
          inviteLink: data.properties?.action_link,
        };
      }),
    );

    const authSucceeded: Array<{
      email: string;
      full_name: string;
      userId: string;
      inviteLink?: string;
    }> = [];
    const phaseResults: InviteResult[] = [];

    for (const result of authResults) {
      if (result.status === "fulfilled") {
        if ("userId" in result.value && result.value.userId) {
          authSucceeded.push({
            email: result.value.email,
            full_name: result.value.full_name,
            userId: result.value.userId,
            inviteLink: result.value.inviteLink,
          });
        } else {
          phaseResults.push({
            email: result.value.email,
            success: false,
            error: result.value.error,
          });
        }
      } else {
        phaseResults.push({
          email: "unknown",
          success: false,
          error: result.reason?.message || "Auth creation failed",
        });
      }
    }

    const profileResults = await Promise.allSettled(
      authSucceeded.map(async (entry) => {
        const { error: userInsertError } = await supabase.from("users").insert({
          id: entry.userId,
          full_name: entry.full_name,
        });
        if (userInsertError) {
          await supabase.auth.admin.deleteUser(entry.userId).catch(() => {});
          return {
            email: entry.email,
            success: false as const,
            error: "Failed to create user identity",
          };
        }
        const { error: profileInsertError } = await supabase
          .schema("organization")
          .from("profiles")
          .insert({
            user_id: entry.userId,
            organization_id: inviterProfile.organization_id,
            role: "ORG_ANALYST",
            account_status: "PENDING",
          });
        if (profileInsertError) {
          await supabase
            .from("users")
            .delete()
            .eq("id", entry.userId)
            .catch(() => {});
          await supabase.auth.admin.deleteUser(entry.userId).catch(() => {});
          return {
            email: entry.email,
            success: false as const,
            error: "Failed to create organization profile",
          };
        }
        return {
          email: entry.email,
          userId: entry.userId,
          inviteLink: entry.inviteLink,
          success: true as const,
        };
      }),
    );

    const auditEntries: Array<{
      email: string;
      userId: string;
      inviteLink?: string;
    }> = [];

    for (const result of profileResults) {
      if (result.status === "fulfilled") {
        if (result.value.success) {
          auditEntries.push({
            email: result.value.email,
            userId: result.value.userId,
            inviteLink: result.value.inviteLink,
          });
          phaseResults.push({
            email: result.value.email,
            success: true,
            user_id: result.value.userId,
            invite_link: result.value.inviteLink,
          });
        } else {
          phaseResults.push({
            email: result.value.email,
            success: false,
            error: result.value.error,
          });
        }
      }
    }

    await Promise.allSettled(
      auditEntries.map((entry) =>
        supabase
          .schema("internal")
          .from("audit_logs")
          .insert({
            user_id: user.id,
            action: "USER_INVITED",
            resource_type: "users",
            resource_id: entry.userId,
            new_values: { email: entry.email, role: "ORG_ANALYST" },
            severity: "INFO",
            organization_id: inviterProfile.organization_id,
          }),
      ),
    );

    const allSuccess = phaseResults.every((r) => r.success);

    return new Response(
      JSON.stringify({
        success: allSuccess,
        results: phaseResults,
        message: allSuccess
          ? `${phaseResults.length} analyst(s) invited successfully.`
          : `${phaseResults.filter((r) => r.success).length} invited, ${phaseResults.filter((r) => !r.success).length} failed.`,
      }),
      {
        status: allSuccess ? 200 : 207,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Invite analyst error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
