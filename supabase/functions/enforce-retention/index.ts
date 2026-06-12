// EdgePulse Enforce Retention Function v1.0.0
// Run on a schedule (e.g. daily via pg_cron) or trigger on-demand via POST.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PurgeRequest {
  organization_id?: string
  device_id?: string
}

interface PurgeResult {
  events_deleted: number
  alerts_deleted: number
  features_deleted: number
  health_deleted: number
  hash_chain_deleted: number
  errors: string[]
}

interface RetentionRow {
  id: string
  organization_id: string
  device_id: string | null
  retention_days: number
  data_types: string[]
}

const DATA_TYPE_TABLES: Record<string, { table: string; date_column: string; schema: string }> = {
  events:      { table: 'events',      date_column: 'collected_at', schema: 'telemetry' },
  alerts:      { table: 'alerts',      date_column: 'created_at',  schema: 'public' },
  features:    { table: 'feature_vectors', date_column: 'computed_at', schema: 'telemetry' },
  health:      { table: 'device_health',   date_column: 'created_at',  schema: 'telemetry' },
  hash_chain:  { table: 'hash_chain_log',  date_column: 'entry_timestamp', schema: 'telemetry' },
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

    const { data: caller } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!caller || (caller.role !== 'ORG_ADMIN' && caller.role !== 'PLATFORM_ADMIN')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient permissions' }),
        { status: 403, headers: corsHeaders }
      )
    }

    const filters: PurgeRequest = await req.json()

    let query = supabase
      .from('retention_settings')
      .select('*')

    if (filters.organization_id) {
      query = query.eq('organization_id', filters.organization_id)
    }
    if (filters.device_id) {
      query = query.eq('device_id', filters.device_id)
    }

    const { data: settings, error: settingsError } = await query

    if (settingsError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch retention settings' }),
        { status: 500, headers: corsHeaders }
      )
    }

    if (!settings || settings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No retention settings found', purged: {
          events_deleted: 0, alerts_deleted: 0, features_deleted: 0,
          health_deleted: 0, hash_chain_deleted: 0, errors: [],
        }}),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const totalResult: PurgeResult = {
      events_deleted: 0,
      alerts_deleted: 0,
      features_deleted: 0,
      health_deleted: 0,
      hash_chain_deleted: 0,
      errors: [],
    }

    for (const row of settings as RetentionRow[]) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - row.retention_days)
      const cutoffISO = cutoff.toISOString()

      for (const dataType of row.data_types) {
        const mapping = DATA_TYPE_TABLES[dataType]
        if (!mapping) continue

        try {
          let deleteQuery = supabase
            .from(mapping.table)
            .delete()
            .lt(mapping.date_column, cutoffISO)
            .eq('organization_id', row.organization_id)

          if (row.device_id) {
            deleteQuery = deleteQuery.eq('device_id', row.device_id)
          }

          const { data: deleted, error: deleteError } = await deleteQuery.select('id')

          if (deleteError) {
            totalResult.errors.push(`${mapping.table}: ${deleteError.message}`)
            continue
          }

          const count = deleted?.length || 0
          switch (dataType) {
            case 'events':     totalResult.events_deleted     += count; break
            case 'alerts':     totalResult.alerts_deleted     += count; break
            case 'features':   totalResult.features_deleted   += count; break
            case 'health':     totalResult.health_deleted     += count; break
            case 'hash_chain': totalResult.hash_chain_deleted += count; break
          }
        } catch (e) {
          totalResult.errors.push(`${dataType}: ${e instanceof Error ? e.message : 'Unknown error'}`)
        }
      }

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'RETENTION_PURGED',
        resource_type: 'retention_settings',
        resource_id: row.id,
        new_values: {
          retention_days: row.retention_days,
          data_types: row.data_types,
          cutoff: cutoffISO,
          result: {
            events: totalResult.events_deleted,
            alerts: totalResult.alerts_deleted,
            features: totalResult.features_deleted,
            health: totalResult.health_deleted,
            hash_chain: totalResult.hash_chain_deleted,
          },
        },
        severity: totalResult.errors.length > 0 ? 'WARNING' : 'INFO',
        organization_id: row.organization_id,
      })
    }

    const isSuccess = totalResult.errors.length === 0

    return new Response(
      JSON.stringify({
        success: isSuccess,
        message: isSuccess
          ? 'Retention policy enforced successfully'
          : `Completed with ${totalResult.errors.length} error(s)`,
        purged: totalResult,
      }),
      {
        status: isSuccess ? 200 : 207,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Retention enforcement error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    )
  }
})
