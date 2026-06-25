// EdgePulse Enrollment Function v3.1.0
import { serve } from "std/http/server.ts";
import { crypto } from "std/crypto/mod.ts";
import { createClient } from "@supabase/supabase-js";
import { encodeBase64 } from "std/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, content-type, x-edgepulse-enrollment-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EnrollmentRequest {
  enrollment_token: string;
  hostname: string;
  operating_system: string;
  agent_version: string;
}

interface EnrollmentResponse {
  success: boolean;
  device_id?: string;
  api_key?: string;
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

    const enrollmentData: EnrollmentRequest = await req.json();

    if (!enrollmentData.enrollment_token) {
      return new Response(
        JSON.stringify({ success: false, error: "Enrollment token required" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";
    if (!bearerToken || bearerToken !== enrollmentData.enrollment_token) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authorization" }),
        { status: 401, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseSecretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseSecretKey);

    const tokenHash = await hashToken(enrollmentData.enrollment_token);

    const { data: tokenData, error: tokenError } = await supabase
      .schema("devices")
      .from("enrollment_tokens")
      .select("*")
      .eq("token_hash", tokenHash)
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid enrollment token" }),
        { status: 401, headers: corsHeaders },
      );
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: "Enrollment token expired" }),
        { status: 401, headers: corsHeaders },
      );
    }

    if (tokenData.current_uses >= tokenData.max_uses) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Enrollment token usage limit reached",
        }),
        { status: 401, headers: corsHeaders },
      );
    }

    const deviceId = crypto.randomUUID();
    const apiKey = await generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey, deviceId);

    const { data: deviceData, error: deviceError } = await supabase
      .from("devices")
      .insert({
        id: deviceId,
        name: enrollmentData.hostname,
        type: "workstation",
        os: enrollmentData.operating_system,
        agent_version: enrollmentData.agent_version,
        status: "online",
        risk: "none",
        enrolled_by: tokenData.created_by,
        last_seen: new Date().toISOString(),
        is_active: true,
        organization_id: tokenData.organization_id,
      })
      .select()
      .single();

    if (deviceError || !deviceData) {
      console.error("Device creation error:", deviceError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create device" }),
        { status: 500, headers: corsHeaders },
      );
    }

    const { data: apiKeyData, error: apiKeyError } = await supabase
      .schema("devices")
      .from("api_keys")
      .insert({
        device_id: deviceId,
        key_hash: apiKeyHash,
        key_name: `Default Key - ${new Date().toISOString()}`,
        is_active: true,
        created_by: tokenData.created_by,
        organization_id: tokenData.organization_id,
      })
      .select()
      .single();

    if (apiKeyError || !apiKeyData) {
      await supabase.from("devices").delete().eq("id", deviceId);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create API key" }),
        { status: 500, headers: corsHeaders },
      );
    }

    const newCurrentUses = tokenData.current_uses + 1;
    const isFullyUsed = newCurrentUses >= tokenData.max_uses;

    await supabase
      .schema("devices")
      .from("enrollment_tokens")
      .update({
        current_uses: newCurrentUses,
        is_used: isFullyUsed,
        used_at: new Date().toISOString(),
        used_by_device: isFullyUsed ? deviceId : null,
      })
      .eq("id", tokenData.id);

    await supabase
      .schema("internal")
      .from("audit_logs")
      .insert({
        device_id: deviceId,
        action: "DEVICE_ENROLLED",
        resource_type: "devices",
        resource_id: deviceId,
        new_values: {
          name: enrollmentData.hostname,
          os: enrollmentData.operating_system,
          agent_version: enrollmentData.agent_version,
        },
        severity: "INFO",
        organization_id: tokenData.organization_id,
      });

    const response: EnrollmentResponse = {
      success: true,
      device_id: deviceId,
      api_key: apiKey,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Enrollment error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: corsHeaders },
    );
  }
});

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashApiKey(apiKey: string, deviceId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey + "ep-v1-" + deviceId);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateApiKey(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return encodeBase64(array).replace(/[+/=]/g, "").substring(0, 40);
}
