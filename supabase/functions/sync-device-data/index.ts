// EdgePulse Device Sync Function v1.0.0
// Handles bulk sync of alerts and telemetry from enrolled devices
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, content-type, x-edgepulse-device-id, x-edgepulse-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface SyncRequest {
  alerts?: AlertRecord[]
  telemetry?: TelemetryEvent[]
  heartbeat?: DeviceHeartbeat
}

interface AlertRecord {
  alert_id?: string
  device_id: string
  device_name: string
  telemetry_event_id?: string
  feature_vector_id?: string
  anomaly_score_id?: string
  anomaly_score: number
  model_id: string
  collection_agent_version: string
  inference_latency_ms: number
  telemetry_source: string
  title: string
  description?: string
  severity: string
  category: string
  confidence: number
  detection_window_start?: string
  detection_window_end?: string
  detection_window_minutes?: number
  explanation_json?: object
  status?: string
  read?: boolean
  net_destination_ip?: string
  net_destination_port?: number
  net_protocol?: string
  net_duration_ms?: number
  proc_name?: string
  proc_privilege_level?: string
  proc_pid?: number
}

interface TelemetryEvent {
  device_id: string
  collected_at: string
  source: string
  payload: object
  collection_agent_version: string
  connectivity_state?: string
  payload_hash?: string
}

interface DeviceHeartbeat {
  device_id: string
  name?: string
  status?: string
  risk?: string
  cpu_percent?: number
  ram_percent?: number
  sync_queue_depth?: number
  alerts_count?: number
  agent_version?: string
  hash_chain_ok?: boolean
}

interface SyncResponse {
  success: boolean
  alerts_synced?: number
  alerts_failed?: number
  telemetry_synced?: number
  telemetry_failed?: number
  heartbeat_updated?: boolean
  error?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 405, headers: corsHeaders }
      )
    }

    const deviceId = req.headers.get('x-edgepulse-device-id')
    const apiKey = req.headers.get('x-edgepulse-api-key')

    if (!deviceId || !apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Device authentication headers required' }),
        { status: 401, headers: corsHeaders }
      )
    }

    // Validate device credentials
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const apiKeyHash = await hashApiKey(apiKey, deviceId)
    const { data: keyData, error: keyError } = await supabase
      .from('agent_api_keys')
      .select('*')
      .eq('device_id', deviceId)
      .eq('key_hash', apiKeyHash)
      .eq('is_active', true)
      .single()

    if (keyError || !keyData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid device credentials' }),
        { status: 401, headers: corsHeaders }
      )
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Device API key expired' }),
        { status: 401, headers: corsHeaders }
      )
    }

    await supabase
      .from('agent_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_id', keyData.key_id)

    const syncData: SyncRequest = await req.json()

    const response: SyncResponse = {
      success: true,
      alerts_synced: 0,
      alerts_failed: 0,
      telemetry_synced: 0,
      telemetry_failed: 0,
      heartbeat_updated: false
    }

    // Sync alerts
    if (syncData.alerts && syncData.alerts.length > 0) {
      try {
        const alerts = syncData.alerts.map(alert => ({
          ...alert,
          device_id: deviceId,
          created_at: alert.alert_id ? undefined : new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: alert.status || 'PENDING',
          read: alert.read || false
        }))

        const { error: alertsError } = await supabase
          .from('alert_records')
          .insert(alerts)

        if (alertsError) {
          console.error('Alert sync error:', alertsError)
          response.alerts_failed = syncData.alerts.length
          response.success = false
        } else {
          response.alerts_synced = syncData.alerts.length
        }
      } catch (e) {
        console.error('Alert sync exception:', e)
        response.alerts_failed = syncData.alerts.length
        response.success = false
      }
    }

    // Sync telemetry
    if (syncData.telemetry && syncData.telemetry.length > 0) {
      try {
        const telemetry = syncData.telemetry.map(event => ({
          ...event,
          device_id: deviceId,
          received_at: new Date().toISOString()
        }))

        const { error: telemetryError } = await supabase
          .from('telemetry_events')
          .insert(telemetry)

        if (telemetryError) {
          console.error('Telemetry sync error:', telemetryError)
          response.telemetry_failed = syncData.telemetry.length
          response.success = false
        } else {
          response.telemetry_synced = syncData.telemetry.length
        }
      } catch (e) {
        console.error('Telemetry sync exception:', e)
        response.telemetry_failed = syncData.telemetry.length
        response.success = false
      }
    }

    // Update device heartbeat
    if (syncData.heartbeat) {
      try {
        const { error: heartbeatError } = await supabase
          .from('device_registry')
          .upsert({
            id: deviceId,
            name: syncData.heartbeat.name || keyData.device_name,
            last_seen: new Date().toISOString(),
            status: syncData.heartbeat.status || 'online',
            risk: syncData.heartbeat.risk || 'none',
            cpu_percent: syncData.heartbeat.cpu_percent,
            ram_percent: syncData.heartbeat.ram_percent,
            sync_queue_depth: syncData.heartbeat.sync_queue_depth,
            alerts_count: syncData.heartbeat.alerts_count,
            agent_version: syncData.heartbeat.agent_version,
            hash_chain_ok: syncData.heartbeat.hash_chain_ok,
            actively_reporting: true
          }, { onConflict: 'id' })

        if (heartbeatError) {
          console.error('Heartbeat update error:', heartbeatError)
          response.success = false
        } else {
          response.heartbeat_updated = true
        }
      } catch (e) {
        console.error('Heartbeat update exception:', e)
        response.success = false
      }
    }

    // Return appropriate status code
    const statusCode = response.success ? 200 : 207 // 207 = Multi-Status (partial success)

    return new Response(
      JSON.stringify(response),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Sync error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    )
  }
})

async function hashApiKey(apiKey: string, deviceId: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(apiKey + 'ep-v1-' + deviceId)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
