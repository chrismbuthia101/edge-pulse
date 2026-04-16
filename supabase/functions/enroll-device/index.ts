// EdgePulse Enrollment Function v1.0.1
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, content-type, x-edgepulse-enrollment-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface EnrollmentRequest {
  enrollment_token: string
  hostname: string
  operating_system: string
  agent_version: string
}

interface EnrollmentResponse {
  success: boolean
  device_id?: string
  api_key?: string
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

    const enrollmentData: EnrollmentRequest = await req.json()

    if (!enrollmentData.enrollment_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Enrollment token required' }),
        { status: 400, headers: corsHeaders }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Validate enrollment token
    const { data: tokenData, error: tokenError } = await supabase
      .from('device_enrollment_tokens')
      .select('*')
      .eq('token_hash', await hashToken(enrollmentData.enrollment_token))
      .single()

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid enrollment token' }),
        { status: 401, headers: corsHeaders }
      )
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Enrollment token expired' }),
        { status: 401, headers: corsHeaders }
      )
    }

    if (tokenData.current_uses >= tokenData.max_uses) {
      return new Response(
        JSON.stringify({ success: false, error: 'Enrollment token usage limit reached' }),
        { status: 401, headers: corsHeaders }
      )
    }

    const deviceId = crypto.randomUUID()
    const apiKey = await generateApiKey()
    const apiKeyHash = await hashApiKey(apiKey, deviceId)

    const { data: deviceData, error: deviceError } = await supabase
      .from('device_registry')
      .insert({
        id: deviceId,
        name: enrollmentData.hostname,
        type: 'workstation',
        os: enrollmentData.operating_system,
        agent_version: enrollmentData.agent_version,
        status: 'online',
        risk: 'none',
        enrolled_by: tokenData.created_by,
        last_seen: new Date().toISOString(),
        is_active: true,
      })
      .select()
      .single()

    if (deviceError || !deviceData) {
      console.error('Device creation error:', deviceError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create device registry entry' }),
        { status: 500, headers: corsHeaders }
      )
    }

    // Create API key entry
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('agent_api_keys')
      .insert({
        device_id: deviceId,
        key_hash: apiKeyHash,
        key_name: `Default Key - ${new Date().toISOString()}`,
        is_active: true,
        created_by: tokenData.created_by,
      })
      .select()
      .single()

    if (apiKeyError || !apiKeyData) {
      // Rollback device creation
      await supabase.from('device_registry').delete().eq('id', deviceId)

      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create API key' }),
        { status: 500, headers: corsHeaders }
      )
    }

    // Update token usage - only mark as fully used when max_uses is reached
    const newCurrentUses = tokenData.current_uses + 1;
    const isFullyUsed = newCurrentUses >= tokenData.max_uses;

    await supabase
      .from('device_enrollment_tokens')
      .update({
        current_uses: newCurrentUses,
        is_used: isFullyUsed,
        used_at: new Date().toISOString(),
        used_by_device_id: isFullyUsed ? deviceId : null,
      })
      .eq('token_id', tokenData.token_id)

    // Create audit trail entry
    await supabase
      .from('audit_trail')
      .insert({
        device_id: deviceId,
        action: 'DEVICE_ENROLLED',
        resource_type: 'device_registry',
        resource_id: deviceId,
        new_values: {
          name: enrollmentData.hostname,
          os: enrollmentData.operating_system,
          agent_version: enrollmentData.agent_version,
        },
        timestamp_utc: new Date().toISOString(),
      })

    const response: EnrollmentResponse = {
      success: true,
      device_id: deviceId,
      api_key: apiKey,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Enrollment error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    )
  }
})

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashApiKey(apiKey: string, deviceId: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(apiKey + 'ep-v1-' + deviceId)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function generateApiKey(): Promise<string> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return encodeBase64(array).replace(/[+/=]/g, '').substring(0, 40)
}