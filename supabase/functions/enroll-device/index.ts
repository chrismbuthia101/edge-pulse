import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Only POST requests allowed
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 405, headers: corsHeaders }
      )
    }

    // Parse request body
    const enrollmentData: EnrollmentRequest = await req.json()
    
    if (!enrollmentData.enrollment_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Enrollment token required' }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Initialize Supabase client
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

    // Check if token is expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Enrollment token expired' }),
        { status: 401, headers: corsHeaders }
      )
    }

    // Check if token usage limit reached
    if (tokenData.current_uses >= tokenData.max_uses) {
      return new Response(
        JSON.stringify({ success: false, error: 'Enrollment token usage limit reached' }),
        { status: 401, headers: corsHeaders }
      )
    }

    // Generate device ID
    const deviceId = crypto.randomUUID()
    
    // Generate API key
    const apiKey = await generateApiKey()
    const apiKeyHash = await hashApiKey(apiKey)

    // Create device registry entry
    const { data: deviceData, error: deviceError } = await supabase
      .from('device_registry')
      .insert({
        device_id: deviceId,
        hostname: enrollmentData.hostname,
        operating_system: enrollmentData.operating_system,
        agent_version: enrollmentData.agent_version,
        enrolled_by: tokenData.created_by,
        last_seen_utc: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (deviceError || !deviceData) {
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
        created_at: new Date().toISOString(),
        created_by: tokenData.created_by
      })
      .select()
      .single()

    if (apiKeyError || !apiKeyData) {
      // Rollback device creation
      await supabase
        .from('device_registry')
        .delete()
        .eq('device_id', deviceId)

      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create API key' }),
        { status: 500, headers: corsHeaders }
      )
    }

    // Update token usage
    await supabase
      .from('device_enrollment_tokens')
      .update({
        current_uses: tokenData.current_uses + 1,
        is_used: true,
        used_at: new Date().toISOString(),
        used_by_device_id: deviceId
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
          hostname: enrollmentData.hostname,
          operating_system: enrollmentData.operating_system,
          agent_version: enrollmentData.agent_version
        },
        timestamp_utc: new Date().toISOString()
      })

    const response: EnrollmentResponse = {
      success: true,
      device_id: deviceId,
      api_key: apiKey
    }

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )

  } catch (error) {
    console.error('Enrollment error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      }),
      { 
        status: 500, 
        headers: corsHeaders 
      }
    )
  }
})

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

async function hashApiKey(apiKey: string): Promise<string> {
  // Use bcrypt-style hashing for API keys
  const encoder = new TextEncoder()
  const data = encoder.encode(apiKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  
  // Add salt (in production, use proper bcrypt)
  const salt = 'edgepulse-api-key-salt-v1'
  const saltedHash = await hashToken(apiKey + salt)
  
  return saltedHash
}

async function generateApiKey(): Promise<string> {
  // Generate 32-byte random API key
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return encodeBase64(array).replace(/[+/=]/g, '').substring(0, 40)
}
