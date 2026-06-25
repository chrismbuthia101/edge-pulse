// EdgePulse Device Sync Function v3.1.0
// Handles bulk sync of alerts, telemetry, anomaly scores, feature vectors,
// health snapshots, and tamper-evident logs from enrolled devices.
import { serve } from "std/http/server.ts";
import { crypto } from "std/crypto/mod.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, content-type, x-edgepulse-device-id, x-edgepulse-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BATCH_SIZE = 100;

interface SyncRequest {
  alerts?: AlertRecord[];
  telemetry?: TelemetryEvent[];
  heartbeat?: DeviceHeartbeat;
  health_snapshots?: HealthSnapshot[];
  anomaly_scores?: AnomalyScore[];
  feature_vectors?: FeatureVector[];
}

interface AlertRecord {
  device_id: string;
  telemetry_event_id?: string;
  feature_vector_id?: string;
  anomaly_score_id?: string;
  anomaly_score: number;
  model_id: string;
  inference_latency_ms: number;
  telemetry_source: string;
  title: string;
  description?: string;
  severity: string;
  category: string;
  alert_type?: string;
  detector_type?: string;
  confidence: number;
  detection_window_start?: string;
  detection_window_end?: string;
  explanation_json?: object;
  status?: string;
  read?: boolean;
  net_destination_ip?: string;
  net_destination_port?: number;
  net_protocol?: string;
  net_duration_ms?: number;
  proc_name?: string;
  proc_privilege_level?: string;
  proc_pid?: number;
  integrity_hash?: string;
  created_at?: string;
}

interface TelemetryEvent {
  device_id: string;
  collected_at: string;
  source: string;
  payload: object;
  connectivity_state?: string;
  payload_hash?: string;
  integrity_hash?: string;
}

interface DeviceHeartbeat {
  cpu_percent?: number;
  ram_percent?: number;
  sync_queue_depth?: number;
  alerts_count?: number;
  agent_version?: string;
}

interface HealthSnapshot {
  device_id: string;
  status?: string;
  cpu_usage?: number;
  memory_usage?: number;
  disk_usage?: number;
  network_status?: boolean;
  alerts_last_24h?: number;
  uptime_percentage?: number;
  response_time_ms?: number;
  error_count?: number;
  warning_count?: number;
  last_restart?: string;
  integrity_hash?: string;
  created_at?: string;
}

interface AnomalyScore {
  id?: string;
  feature_vector_id?: string;
  device_id: string;
  model_id: string;
  score: number;
  label?: string;
  threshold_applied: number;
  above_threshold: boolean;
  inference_latency_ms: number;
  connectivity_state?: string;
  scored_at: string;
  integrity_hash?: string;
  created_at?: string;
}

interface FeatureVector {
  id?: string;
  event_id?: string;
  device_id: string;
  computed_at: string;
  model_id: string;
  features: Record<string, number>;
  feature_version: string;
  integrity_hash?: string;
  created_at?: string;
}

interface SyncResponse {
  success: boolean;
  alerts_synced: number;
  alerts_failed: number;
  telemetry_synced: number;
  telemetry_failed: number;
  heartbeat_updated: boolean;
  health_snapshots_synced: number;
  health_snapshots_failed: number;
  anomaly_scores_synced: number;
  anomaly_scores_failed: number;
  feature_vectors_synced: number;
  feature_vectors_failed: number;
  error?: string;
}

const VALID_TELEMETRY_SOURCES = new Set([
  "PROCESS",
  "NETWORK",
  "FILE",
  "RESOURCE",
]);

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

    const deviceId = req.headers.get("x-edgepulse-device-id");
    const apiKey = req.headers.get("x-edgepulse-api-key");

    if (!deviceId || !apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Device authentication headers required",
        }),
        { status: 401, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseSecretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseSecretKey);

    const apiKeyHash = await hashApiKey(apiKey, deviceId);
    const { data: keyData, error: keyError } = await supabase
      .schema("devices")
      .from("api_keys")
      .select("*")
      .eq("device_id", deviceId)
      .eq("key_hash", apiKeyHash)
      .eq("is_active", true)
      .single();

    if (keyError || !keyData) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid device credentials" }),
        { status: 401, headers: corsHeaders },
      );
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: "Device API key expired" }),
        { status: 401, headers: corsHeaders },
      );
    }

    await supabase
      .schema("devices")
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyData.id);

    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("organization_id")
      .eq("id", deviceId)
      .single();

    if (deviceError || !device) {
      return new Response(
        JSON.stringify({ success: false, error: "Device not found" }),
        { status: 404, headers: corsHeaders },
      );
    }

    const organizationId = device.organization_id;
    const syncData: SyncRequest = await req.json();
    const serverTimestamp = new Date().toISOString();

    const response: SyncResponse = {
      success: true,
      alerts_synced: 0,
      alerts_failed: 0,
      telemetry_synced: 0,
      telemetry_failed: 0,
      heartbeat_updated: false,
      health_snapshots_synced: 0,
      health_snapshots_failed: 0,
      anomaly_scores_synced: 0,
      anomaly_scores_failed: 0,
      feature_vectors_synced: 0,
      feature_vectors_failed: 0,
    };

    const integrityKey = await deriveIntegrityKey(apiKey);

    const handlers: Promise<void>[] = [];

    // ─── Alerts ───────────────────────────────────────────────────────────
    if (syncData.alerts && syncData.alerts.length > 0) {
      handlers.push(
        (async () => {
          let validAlertCount = 0;
          try {
            const batch = syncData.alerts!.slice(0, MAX_BATCH_SIZE);
            const exclude = new Set([
              "device_id",
              "organization_id",
              "created_at",
              "updated_at",
            ]);
            const { valid: validAlerts, failedCount: failedAlerts } =
              (await filterValidRecords(
                integrityKey,
                batch as unknown as Record<string, unknown>[],
                exclude,
              )) as unknown as { valid: typeof batch; failedCount: number };
            validAlertCount = validAlerts.length;
            if (failedAlerts > 0) response.alerts_failed += failedAlerts;
            const alerts = validAlerts.map((alert) => ({
              device_id: deviceId,
              event_id: alert.telemetry_event_id || null,
              feature_vector_id: alert.feature_vector_id || null,
              anomaly_score_id: alert.anomaly_score_id || null,
              anomaly_score: alert.anomaly_score,
              model_id: alert.model_id,
              inference_latency_ms: alert.inference_latency_ms,
              integrity_hash: alert.integrity_hash || null,
              telemetry_source: alert.telemetry_source,
              title: alert.title,
              description: alert.description || null,
              severity: alert.severity,
              category: alert.category,
              alert_type: alert.alert_type || null,
              detector_type: alert.detector_type || null,
              confidence: alert.confidence,
              detection_window_start: alert.detection_window_start || null,
              detection_window_end: alert.detection_window_end || null,
              explanation_json: alert.explanation_json || {},
              net_destination_ip: alert.net_destination_ip || null,
              net_destination_port: alert.net_destination_port || null,
              net_protocol: alert.net_protocol || null,
              net_duration_ms: alert.net_duration_ms || null,
              proc_name: alert.proc_name || null,
              proc_privilege_level: alert.proc_privilege_level || null,
              proc_pid: alert.proc_pid || null,
              status: alert.status || "PENDING",
              read: alert.read === true,
              organization_id: organizationId,
              created_at: alert.created_at || serverTimestamp,
              updated_at: serverTimestamp,
            }));

            const { error: alertsError } = await supabase
              .from("alerts")
              .insert(alerts);

            if (alertsError) {
              console.error("Alert sync error:", alertsError);
              response.alerts_failed += validAlertCount;
              response.success = false;
            } else {
              response.alerts_synced += validAlertCount;
            }
          } catch (e) {
            console.error("Alert sync exception:", e);
            response.alerts_failed += validAlertCount;
            response.success = false;
          }
        })(),
      );
    }

    // ─── Telemetry ────────────────────────────────────────────────────────
    if (syncData.telemetry && syncData.telemetry.length > 0) {
      handlers.push(
        (async () => {
          try {
            const batch = syncData.telemetry!.slice(0, MAX_BATCH_SIZE);
            const exclude = new Set([
              "device_id",
              "organization_id",
              "received_at",
            ]);
            const { valid: validEvents, failedCount: failedEvents } =
              (await filterValidRecords(
                integrityKey,
                batch as unknown as Record<string, unknown>[],
                exclude,
              )) as unknown as { valid: typeof batch; failedCount: number };
            if (failedEvents > 0) response.telemetry_failed += failedEvents;
            const telemetry = validEvents.map((event) => ({
              device_id: deviceId,
              collected_at: event.collected_at,
              source: VALID_TELEMETRY_SOURCES.has(event.source)
                ? event.source
                : "RESOURCE",
              payload: event.payload,
              connectivity_state:
                event.connectivity_state === "offline" ? "offline" : "online",
              payload_hash: event.payload_hash || "",
              integrity_hash: event.integrity_hash || null,
              organization_id: organizationId,
              received_at: serverTimestamp,
            }));

            const { error: telemetryError } = await supabase
              .schema("telemetry")
              .from("events")
              .insert(telemetry);

            if (telemetryError) {
              console.error("Telemetry sync error:", telemetryError);
              response.telemetry_failed += validEvents.length;
              response.success = false;
            } else {
              response.telemetry_synced += validEvents.length;
            }
          } catch (e) {
            console.error("Telemetry sync exception:", e);
            response.telemetry_failed += syncData.telemetry!.length;
            response.success = false;
          }
        })(),
      );
    }

    // ─── Heartbeat ────────────────────────────────────────────────────────
    if (syncData.heartbeat) {
      handlers.push(
        (async () => {
          try {
            const updateFields: Record<string, unknown> = {
              last_seen: serverTimestamp,
              actively_reporting: true,
            };
            const hb = syncData.heartbeat!;
            if (hb.cpu_percent !== undefined)
              updateFields.cpu_percent = hb.cpu_percent;
            if (hb.ram_percent !== undefined)
              updateFields.ram_percent = hb.ram_percent;
            if (hb.sync_queue_depth !== undefined)
              updateFields.sync_queue_depth = hb.sync_queue_depth;
            if (hb.alerts_count !== undefined)
              updateFields.alerts_count = hb.alerts_count;
            if (hb.agent_version !== undefined)
              updateFields.agent_version = hb.agent_version;

            const { error: heartbeatError } = await supabase
              .from("devices")
              .update(updateFields)
              .eq("id", deviceId);

            if (heartbeatError) {
              console.error("Heartbeat update error:", heartbeatError);
              response.success = false;
            } else {
              response.heartbeat_updated = true;
            }
          } catch (e) {
            console.error("Heartbeat update exception:", e);
            response.success = false;
          }
        })(),
      );
    }

    // ─── Health Snapshots ────────────────────────────────────────────────
    if (syncData.health_snapshots && syncData.health_snapshots.length > 0) {
      handlers.push(
        (async () => {
          try {
            const batch = syncData.health_snapshots!.slice(0, MAX_BATCH_SIZE);
            const exclude = new Set([
              "device_id",
              "organization_id",
              "created_at",
            ]);
            const { valid: validSnapshots, failedCount: failedSnapshots } =
              (await filterValidRecords(
                integrityKey,
                batch as unknown as Record<string, unknown>[],
                exclude,
              )) as unknown as { valid: typeof batch; failedCount: number };
            if (failedSnapshots > 0)
              response.health_snapshots_failed += failedSnapshots;
            const snapshots = validSnapshots.map((snapshot) => ({
              device_id: deviceId,
              status: snapshot.status || "ONLINE",
              cpu_usage: snapshot.cpu_usage,
              memory_usage: snapshot.memory_usage,
              disk_usage: snapshot.disk_usage,
              network_status:
                snapshot.network_status !== undefined
                  ? snapshot.network_status
                  : true,
              alerts_last_24h: snapshot.alerts_last_24h || 0,
              uptime_percentage: snapshot.uptime_percentage,
              response_time_ms: snapshot.response_time_ms,
              error_count: snapshot.error_count || 0,
              warning_count: snapshot.warning_count || 0,
              last_restart: snapshot.last_restart || null,
              integrity_hash: snapshot.integrity_hash || null,
              organization_id: organizationId,
              created_at: snapshot.created_at || serverTimestamp,
            }));

            const { error: healthError } = await supabase
              .schema("telemetry")
              .from("device_health")
              .insert(snapshots);

            if (healthError) {
              console.error("Health snapshot sync error:", healthError);
              response.health_snapshots_failed += validSnapshots.length;
              response.success = false;
            } else {
              response.health_snapshots_synced += validSnapshots.length;
            }
          } catch (e) {
            console.error("Health snapshot sync exception:", e);
            response.health_snapshots_failed =
              syncData.health_snapshots!.length;
            response.success = false;
          }
        })(),
      );
    }

    // ─── Anomaly Scores ──────────────────────────────────────────────────
    if (syncData.anomaly_scores && syncData.anomaly_scores.length > 0) {
      handlers.push(
        (async () => {
          try {
            const batch = syncData.anomaly_scores!.slice(0, MAX_BATCH_SIZE);
            const exclude = new Set([
              "device_id",
              "organization_id",
              "created_at",
            ]);
            const { valid: validScores, failedCount: failedScores } =
              (await filterValidRecords(
                integrityKey,
                batch as unknown as Record<string, unknown>[],
                exclude,
              )) as unknown as { valid: typeof batch; failedCount: number };
            if (failedScores > 0)
              response.anomaly_scores_failed += failedScores;
            const scores = validScores.map((s) => ({
              device_id: deviceId,
              feature_vector_id: s.feature_vector_id || null,
              model_id: s.model_id,
              score: s.score,
              label: s.label || null,
              threshold_applied: s.threshold_applied,
              above_threshold: s.above_threshold,
              inference_latency_ms: s.inference_latency_ms,
              connectivity_state:
                s.connectivity_state === "offline" ? "offline" : "online",
              integrity_hash: s.integrity_hash || null,
              organization_id: organizationId,
              scored_at: s.scored_at,
              created_at: s.created_at || serverTimestamp,
            }));

            const { error: scoreError } = await supabase
              .schema("telemetry")
              .from("anomaly_scores")
              .insert(scores);

            if (scoreError) {
              console.error("Anomaly score sync error:", scoreError);
              response.anomaly_scores_failed += validScores.length;
              response.success = false;
            } else {
              response.anomaly_scores_synced += validScores.length;
            }
          } catch (e) {
            console.error("Anomaly score sync exception:", e);
            response.anomaly_scores_failed += syncData.anomaly_scores!.length;
            response.success = false;
          }
        })(),
      );
    }

    // ─── Feature Vectors ─────────────────────────────────────────────────
    if (syncData.feature_vectors && syncData.feature_vectors.length > 0) {
      handlers.push(
        (async () => {
          try {
            const batch = syncData.feature_vectors!.slice(0, MAX_BATCH_SIZE);

            const exclude = new Set([
              "device_id",
              "organization_id",
              "created_at",
              "received_at",
            ]);
            const { valid: validFvs, failedCount: failedFvs } =
              (await filterValidRecords(
                integrityKey,
                batch as unknown as Record<string, unknown>[],
                exclude,
              )) as unknown as { valid: typeof batch; failedCount: number };
            if (failedFvs > 0) response.feature_vectors_failed += failedFvs;

            let fallbackEventId: string | null = null;
            const needsEventFallback = validFvs.some((fv) => !fv.event_id);
            if (needsEventFallback) {
              const { data: lastEvent } = await supabase
                .schema("telemetry")
                .from("events")
                .select("id")
                .eq("device_id", deviceId)
                .order("collected_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              fallbackEventId = lastEvent?.id || null;
            }

            const features = validFvs
              .map((fv) => ({
                device_id: deviceId,
                event_id: fv.event_id || fallbackEventId,
                computed_at: fv.computed_at,
                model_id: fv.model_id,
                features: fv.features,
                feature_version: fv.feature_version,
                organization_id: organizationId,
                created_at: fv.created_at || serverTimestamp,
                received_at: serverTimestamp,
                integrity_hash: fv.integrity_hash || null,
              }))
              .filter((fv) => fv.event_id != null);

            if (features.length === 0) {
              response.feature_vectors_synced = 0;
              response.feature_vectors_failed += batch.length;
              return;
            }

            const { error: fvError } = await supabase
              .schema("telemetry")
              .from("feature_vectors")
              .insert(features);

            if (fvError) {
              console.error("Feature vector sync error:", fvError);
              response.feature_vectors_failed += validFvs.length;
              response.success = false;
            } else {
              response.feature_vectors_synced += validFvs.length;
            }
          } catch (e) {
            console.error("Feature vector sync exception:", e);
            response.feature_vectors_failed += syncData.feature_vectors!.length;
            response.success = false;
          }
        })(),
      );
    }

    await Promise.allSettled(handlers);

    const statusCode = response.success ? 200 : 207;

    return new Response(JSON.stringify(response), {
      status: statusCode,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: corsHeaders },
    );
  }
});

async function hashApiKey(apiKey: string, deviceId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey + "ep-v1-" + deviceId);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── HMAC Integrity Verification ──────────────────────────────────────────

function canonicalJson(
  record: Record<string, unknown>,
  exclude: Set<string>,
): string {
  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (!exclude.has(key) && key !== "integrity_hash") {
      canonical[key] = record[key];
    }
  }
  return JSON.stringify(canonical);
}

async function deriveIntegrityKey(apiKey: string): Promise<CryptoKey> {
  const keyBytes = new TextEncoder().encode(apiKey);
  const salt = new TextEncoder().encode("edgepulse-integrity");

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derivedBits = await crypto.subtle.sign("HMAC", key, salt);

  return await crypto.subtle.importKey(
    "raw",
    derivedBits,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function computeIntegrityHash(
  key: CryptoKey,
  record: Record<string, unknown>,
  exclude: Set<string>,
): Promise<string> {
  const data = new TextEncoder().encode(canonicalJson(record, exclude));
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function filterValidRecords<T extends Record<string, unknown>>(
  key: CryptoKey,
  records: T[],
  exclude: Set<string>,
): Promise<{ valid: T[]; failedCount: number }> {
  const valid: T[] = [];
  let failedCount = 0;

  for (const record of records) {
    const received = record["integrity_hash"] as string | undefined;
    if (!received) {
      failedCount++;
      continue;
    }
    const computed = await computeIntegrityHash(key, record, exclude);
    if (computed === received) {
      valid.push(record);
    } else {
      failedCount++;
    }
  }

  return { valid, failedCount };
}
