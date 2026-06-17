// EdgePulse Invite Analyst Function v1.0.0
import { serve } from 'std/http/server.ts'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface InviteRequest {
  email: string
  full_name: string
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

    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseSecretKey = Deno.env.get('SB_SECRET_KEY')!
    const supabase = createClient(supabaseUrl, supabaseSecretKey)

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

    const { email, full_name }: InviteRequest = await req.json()
    if (!email || !full_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email and full_name required' }),
        { status: 400, headers: corsHeaders }
      )
    }

    const { data: linkData, error: createError } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `${Deno.env.get('PUBLIC_APP_URL') || 'https://app.edgepulse.dev'}/accept-invite`,
        data: {
          invited_by: user.id,
          organization_id: inviter.organization_id,
        },
      },
    })

    if (createError || !linkData.user) {
      console.error('User creation error:', createError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create user. Email may already be registered.' }),
        { status: 409, headers: corsHeaders }
      )
    }

    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: linkData.user.id,
        full_name,
        role: 'ORG_ANALYST',
        account_status: 'PENDING',
        organization_id: inviter.organization_id,
      })

    if (profileError) {
      await supabase.auth.admin.deleteUser(linkData.user.id)
      console.error('Profile creation error:', profileError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create user profile' }),
        { status: 500, headers: corsHeaders }
      )
    }

    await supabase.schema('internal').from('audit_logs').insert({
      user_id: user.id,
      action: 'USER_INVITED',
      resource_type: 'users',
      resource_id: linkData.user.id,
      new_values: { email, full_name, role: 'ORG_ANALYST' },
      severity: 'INFO',
      organization_id: inviter.organization_id,
    })

    return new Response(
      JSON.stringify({
        success: true,
        user_id: linkData.user.id,
        invite_link: linkData.properties?.action_link,
        message: 'Analyst invited successfully.',
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
