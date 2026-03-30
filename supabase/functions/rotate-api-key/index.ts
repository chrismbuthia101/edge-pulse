import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'
import { encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, content-type, x-edgepulse-device-id, x-edgepulse-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RotateKeyResponse {
  success: boolean
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

    // Extract device authentication headers
    const deviceId = req.headers.get('x-edgepulse-device-id')
    const apiKey = req.headers.get('x-edgepulse-api-key')
    
    if (!deviceId || !apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Device authentication headers required' }),
        { status: 401, headers: corsHeaders }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Validate API key
    const apiKeyHash = await hashApiKey(apiKey)
    const { data: keyData, error: keyError } = await supabase
      .from('agent_api_keys')
      .select('*')
      .eq('device_id', deviceId)
      .eq('key_hash', apiKeyHash)
      .eq('is_active', true)
      .single()

    if (keyError || !keyData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid API key' }),
        { status: 401, headers: corsHeaders }
      )
    }

    // Check if key is expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'API key expired' }),
        { status: 401, headers: corsHeaders }
      )
    }

    // Deactivate old key
    await supabase
      .from('agent_api_keys')
      .update({ is_active: false })
      .eq('key_id', keyData.key_id)

    // Generate new API key
    const newApiKey = await generateApiKey()
    const newApiKeyHash = await hashApiKey(newApiKey)

    // Create new API key entry
    const { data: newKeyData, error: newKeyError } = await supabase
      .from('agent_api_keys')
      .insert({
        device_id: deviceId,
        key_hash: newApiKeyHash,
        key_name: `Rotated Key - ${new Date().toISOString()}`,
        is_active: true,
        created_at: new Date().toISOString(),
        created_by: keyData.created_by
      })
      .select()
      .single()

    if (newKeyError || !newKeyData) {
      // Reactivate old key on failure
      await supabase
        .from('agent_api_keys')
        .update({ is_active: true })
        .eq('key_id', keyData.key_id)

      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create new API key' }),
        { status: 500, headers: corsHeaders }
      )
    }

    // Update last used timestamp for old key
    await supabase
      .from('agent_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_id', keyData.key_id)

    // Create audit trail entry
    await supabase
      .from('audit_trail')
      .insert({
        device_id: deviceId,
        action: 'API_KEY_ROTATED',
        resource_type: 'agent_api_keys',
        resource_id: newKeyData.key_id,
        old_values: {
          key_id: keyData.key_id,
          key_name: keyData.key_name
        },
        new_values: {
          key_id: newKeyData.key_id,
          key_name: newKeyData.key_name
        },
        timestamp_utc: new Date().toISOString()
      })

    const response: RotateKeyResponse = {
      success: true,
      api_key: newApiKey
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
    console.error('API key rotation error:', error)
    
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

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

async function generateApiKey(): Promise<string> {
  // Generate 32-byte random API key
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return encodeBase64(array).replace(/[+/=]/g, '').substring(0, 40)
}
