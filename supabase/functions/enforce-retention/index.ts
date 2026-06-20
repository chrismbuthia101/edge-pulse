// EdgePulse Enforce Retention Function v1.0.0
// Run on a schedule (e.g. daily via pg_cron) or trigger on-demand via POST.
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PurgeRequest {
  organization_id?: string;
  device_id?: string;
}

interface PurgeResult {
  events_deleted: number;
  alerts_deleted: number;
  features_deleted: number;
  health_deleted: number;
  errors: string[];
}

interface RetentionRow {
  id: string;
  organization_id: string;
  device_id: string | null;
  retention_days: number;
  data_types: string[];
}

const DATA_TYPE_TABLES: Record<
  string,
  { table: string; date_column: string; schema: string }
> = {
  events: { table: "events", date_column: "collected_at", schema: "telemetry" },
  alerts: { table: "alerts", date_column: "created_at", schema: "public" },
  features: {
    table: "feature_vectors",
    date_column: "computed_at",
    schema: "telemetry",
  },
  health: {
    table: "device_health",
    date_column: "created_at",
    schema: "telemetry",
  },
};

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseSecretKey = Deno.env.get("SB_SECRET_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseSecretKey);

    // Auth is optional — when invoked via cron/schedule, no user context exists.
    // When invoked on-demand with a JWT, validate the caller has admin rights.
    let effectiveUserId: string | null = null;
    let effectiveOrgId: string | null = null;

    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!authError && user) {
        const { data: caller } = await supabase
          .schema("organization")
          .from("profiles")
          .select("user_id, role, organization_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (
          caller &&
          (caller.role === "ORG_ADMIN" || caller.role === "PLATFORM_ADMIN")
        ) {
          effectiveUserId = caller.user_id;
          effectiveOrgId = caller.organization_id;
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Insufficient permissions",
            }),
            { status: 403, headers: corsHeaders },
          );
        }
      }
    }

    const filters: PurgeRequest = await req.json();

    let query = supabase.from("retention_settings").select("*");

    if (filters.organization_id) {
      query = query.eq("organization_id", filters.organization_id);
    }
    if (filters.device_id) {
      query = query.eq("device_id", filters.device_id);
    }

    const { data: settings, error: settingsError } = await query;

    if (settingsError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to fetch retention settings",
        }),
        { status: 500, headers: corsHeaders },
      );
    }

    if (!settings || settings.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No retention settings found",
          purged: {
            events_deleted: 0,
            alerts_deleted: 0,
            features_deleted: 0,
            health_deleted: 0,
            errors: [],
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const totalResult: PurgeResult = {
      events_deleted: 0,
      alerts_deleted: 0,
      features_deleted: 0,
      health_deleted: 0,
      errors: [],
    };

    for (const row of settings as RetentionRow[]) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - row.retention_days);
      const cutoffISO = cutoff.toISOString();

      const rowBefore = { ...totalResult };

      for (const dataType of row.data_types) {
        const mapping = DATA_TYPE_TABLES[dataType];
        if (!mapping) continue;

        try {
          const { data: count, error: deleteError } = await supabase
            .schema("internal")
            .rpc("purge_table_data", {
              p_schema: mapping.schema,
              p_table: mapping.table,
              p_column: mapping.date_column,
              p_cutoff: cutoffISO,
              p_org_id: row.organization_id,
              p_device_id: row.device_id,
            });

          if (deleteError) {
            totalResult.errors.push(`${mapping.table}: ${deleteError.message}`);
            continue;
          }

          switch (dataType) {
            case "events":
              totalResult.events_deleted += count;
              break;
            case "alerts":
              totalResult.alerts_deleted += count;
              break;
            case "features":
              totalResult.features_deleted += count;
              break;
            case "health":
              totalResult.health_deleted += count;
              break;
          }
        } catch (e) {
          totalResult.errors.push(
            `${dataType}: ${e instanceof Error ? e.message : "Unknown error"}`,
          );
        }
      }

      if (effectiveUserId) {
        await supabase
          .schema("internal")
          .from("audit_logs")
          .insert({
            user_id: effectiveUserId,
            action: "RETENTION_PURGED",
            resource_type: "retention_settings",
            resource_id: row.id,
            new_values: {
              retention_days: row.retention_days,
              data_types: row.data_types,
              cutoff: cutoffISO,
              result: {
                events: totalResult.events_deleted - rowBefore.events_deleted,
                alerts: totalResult.alerts_deleted - rowBefore.alerts_deleted,
                features:
                  totalResult.features_deleted - rowBefore.features_deleted,
                health: totalResult.health_deleted - rowBefore.health_deleted,
              },
            },
            severity: totalResult.errors.length > 0 ? "WARNING" : "INFO",
            organization_id: row.organization_id,
          });
      }
    }

    const isSuccess = totalResult.errors.length === 0;

    return new Response(
      JSON.stringify({
        success: isSuccess,
        message: isSuccess
          ? "Retention policy enforced successfully"
          : `Completed with ${totalResult.errors.length} error(s)`,
        purged: totalResult,
      }),
      {
        status: isSuccess ? 200 : 207,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Retention enforcement error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
