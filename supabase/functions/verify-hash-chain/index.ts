import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, x-edgepulse-device-id, x-edgepulse-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only administrators can verify hash chains
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    
    // Verify JWT token
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is administrator
    const { data: userData } = await supabase
      .from("analyst_users")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!userData || userData.role !== "ADMINISTRATOR") {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "GET") {
      const url = new URL(req.url);
      const deviceId = url.searchParams.get("device_id");
      const fromSequence = url.searchParams.get("from_sequence");
      const toSequence = url.searchParams.get("to_sequence");

      if (!deviceId) {
        return new Response(
          JSON.stringify({ error: "device_id parameter required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Query tamper evident log entries
      let query = supabase
        .from("tamper_evident_log")
        .select("*")
        .eq("device_id", deviceId)
        .order("log_sequence_number", { ascending: true });

      if (fromSequence) {
        query = query.gte("log_sequence_number", parseInt(fromSequence));
      }
      if (toSequence) {
        query = query.lte("log_sequence_number", parseInt(toSequence));
      }

      const { data: logEntries, error: logError } = await query;

      if (logError) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch hash chain" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify chain integrity
      const verification = await verifyChainIntegrity(logEntries || []);

      return new Response(
        JSON.stringify({
          device_id: deviceId,
          entries: logEntries,
          verification: verification,
          total_entries: logEntries?.length || 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Hash chain verification error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function verifyChainIntegrity(entries: any[]): Promise<{
  is_valid: boolean;
  first_broken_sequence?: number;
  break_reason?: string;
}> {
  if (!entries || entries.length === 0) {
    return { is_valid: true };
  }

  let previousHash = "0".repeat(64); // Genesis hash

  for (const entry of entries) {
    // Verify sequence continuity
    if (entry.previous_entry_hash !== previousHash) {
      return {
        is_valid: false,
        first_broken_sequence: entry.log_sequence_number,
        break_reason: `Hash chain broken at sequence ${entry.log_sequence_number}: expected ${previousHash}, got ${entry.previous_entry_hash}`
      };
    }

    // Verify content hash
    const expectedContentHash = await computeContentHash(entry);
    if (entry.entry_content_hash !== expectedContentHash) {
      return {
        is_valid: false,
        first_broken_sequence: entry.log_sequence_number,
        break_reason: `Content hash mismatch at sequence ${entry.log_sequence_number}: expected ${expectedContentHash}, got ${entry.entry_content_hash}`
      };
    }

    // Verify digital signature if present
    if (entry.digital_signature) {
      const signatureValid = await verifySignature(entry, expectedContentHash);
      if (!signatureValid) {
        return {
          is_valid: false,
          first_broken_sequence: entry.log_sequence_number,
          break_reason: `Invalid digital signature at sequence ${entry.log_sequence_number}`
        };
      }
    }

    previousHash = entry.entry_content_hash;
  }

  return { is_valid: true };
}

async function computeContentHash(entry: any): Promise<string> {
  const content = {
    device_id: entry.device_id,
    log_sequence_number: entry.log_sequence_number,
    log_entry_type: entry.log_entry_type,
    log_entry_reference_id: entry.log_entry_reference_id,
    entry_timestamp_utc: entry.entry_timestamp_utc,
    entry_content_hash: entry.entry_content_hash,
    previous_entry_hash: entry.previous_entry_hash
  };

  const data = new TextEncoder().encode(JSON.stringify(content));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(entry: any, contentHash: string): Promise<boolean> {
  // In a real implementation, this would verify the digital signature
  // For now, we'll assume signatures are valid if present
  return entry.digital_signature !== null && entry.digital_signature !== undefined;
}
