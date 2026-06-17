// EdgePulse API Key Rotation Function v3.0.0
import { serve } from 'std/http/server.ts'
import { crypto } from 'std/crypto/mod.ts'
import { createClient } from '@supabase/supabase-js'
import { encodeBase64 } from 'std/encoding/base64.ts'

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

serve(async (req: Request) => {
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseSecretKey = Deno.env.get('SB_SECRET_KEY')!
    const supabase = createClient(supabaseUrl, supabaseSecretKey)

    const apiKeyHash = await hashApiKey(apiKey, deviceId)
    const { data: keyData, error: keyError } = await supabase
      .schema('devices')
      .from('api_keys')
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

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'API key expired' }),
        { status: 401, headers: corsHeaders }
      )
    }

    await supabase
      .schema('devices')
      .from('api_keys')
      .update({ is_active: false, last_used_at: new Date().toISOString() })
      .eq('id', keyData.id)

    const newApiKey = await generateApiKey()
    const newApiKeyHash = await hashApiKey(newApiKey, deviceId)

    const { data: newKeyData, error: newKeyError } = await supabase
      .schema('devices')
      .from('api_keys')
      .insert({
        device_id: deviceId,
        key_hash: newApiKeyHash,
        key_name: `Rotated Key - ${new Date().toISOString()}`,
        is_active: true,
        created_by: keyData.created_by,
        organization_id: keyData.organization_id,
      })
      .select()
      .single()

    if (newKeyError || !newKeyData) {
      await supabase
        .schema('devices')
        .from('api_keys')
        .update({ is_active: true })
        .eq('id', keyData.id)

      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create new API key' }),
        { status: 500, headers: corsHeaders }
      )
    }

    await supabase
      .schema('internal')
      .from('audit_logs')
      .insert({
        device_id: deviceId,
        action: 'API_KEY_ROTATED',
        resource_type: 'api_keys',
        resource_id: newKeyData.id,
        old_values: { key_id: keyData.id, key_name: keyData.key_name },
        new_values: { key_id: newKeyData.id, key_name: newKeyData.key_name },
        severity: 'INFO',
        organization_id: keyData.organization_id,
      })

    return new Response(
      JSON.stringify({ success: true, api_key: newApiKey } as RotateKeyResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('API key rotation error:', error)
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

async function generateApiKey(): Promise<string> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return encodeBase64(array).replace(/[+/=]/g, '').substring(0, 40)
}
