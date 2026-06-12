// EdgePulse Invite Analyst Function v1.0.0
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface InviteRequest {
  email: string
  full_name: string
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

    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: corsHeaders }
      )
    }

    const { data: inviter, error: userError } = await supabase
      .from('users')
      .select('id, organization_id, role, account_status')
      .eq('id', user.id)
      .single()

    if (userError || !inviter) {
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { status: 404, headers: corsHeaders }
      )
    }

    if (inviter.role !== 'ORG_ADMIN' || inviter.account_status !== 'ACTIVE') {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient permissions' }),
        { status: 403, headers: corsHeaders }
      )
    }

    if (!inviter.organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'No organization associated' }),
        { status: 400, headers: corsHeaders }
      )
    }

    const { email, full_name, department }: InviteRequest = await req.json()
    if (!email || !full_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email and full_name required' }),
        { status: 400, headers: corsHeaders }
      )
    }

    const existingUser = await supabase
      .from('users')
      .select('id, account_status')
      .eq('id', user.id)
      .maybeSingle()

    const defaultPassword = crypto.randomUUID().replace(/-/g, '').substring(0, 16) + 'Aa1!'

    const { data: invitedUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: defaultPassword,
      email_confirm: true,
      user_metadata: {
        invited_by: user.id,
        organization_id: inviter.organization_id,
      },
    })

    if (createError || !invitedUser.user) {
      console.error('User creation error:', createError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create user. Email may already be registered.' }),
        { status: 409, headers: corsHeaders }
      )
    }

    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: invitedUser.user.id,
        full_name,
        department: department || null,
        role: 'ORG_ANALYST',
        account_status: 'PENDING',
        organization_id: inviter.organization_id,
      })

    if (profileError) {
      await supabase.auth.admin.deleteUser(invitedUser.user.id)
      console.error('Profile creation error:', profileError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create user profile' }),
        { status: 500, headers: corsHeaders }
      )
    }

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'USER_INVITED',
      resource_type: 'users',
      resource_id: invitedUser.user.id,
      new_values: { email, full_name, role: 'ORG_ANALYST' },
      severity: 'INFO',
      organization_id: inviter.organization_id,
    })

    return new Response(
      JSON.stringify({
        success: true,
        user_id: invitedUser.user.id,
        message: 'Analyst invited successfully. They will receive credentials separately.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Invite analyst error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    )
  }
})
