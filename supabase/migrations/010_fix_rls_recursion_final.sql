-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 010_fix_rls_recursion_final
-- Description: Definitively fix infinite recursion in RLS policies.
--
-- ROOT CAUSE:
--   is_admin() and is_analyst_or_admin() query analyst_users.
--   RLS policies on analyst_users call those same functions.
--   → infinite recursion.
--
-- FIX STRATEGY:
--   The helper functions must bypass RLS when querying analyst_users.
--   The only fully reliable way in Supabase/PostgreSQL is:
--     1. LANGUAGE plpgsql (not sql — SET LOCAL doesn't work in sql functions)
--     2. SECURITY DEFINER (runs as the function owner, typically postgres)
--     3. SET LOCAL row_security = off  ← disables RLS for this query only
--        placed BEFORE the SELECT inside the function body.
--   Migration 009 had the right idea but used LANGUAGE sql for is_admin()
--   and is_analyst_or_admin(), where SET LOCAL is silently ignored.
--   This migration corrects that.
--
-- ALSO FIXED:
--   • is_user_approved() / is_user_administrator() from migration 007
--     have the same recursion risk — replaced here too.
--   • analyst_has_device_access() queried analyst_device_assignments which
--     has policies that call is_admin() — chained recursion fixed by
--     inlining the admin check with row_security off.
-- ============================================================

-- ─── Drop all affected helper functions (CASCADE drops dependent policies) ───
-- We will recreate all RLS policies that depended on these functions.

DROP FUNCTION IF EXISTS is_admin()                        CASCADE;
DROP FUNCTION IF EXISTS is_analyst_or_admin()             CASCADE;
DROP FUNCTION IF EXISTS is_authenticated_device()         CASCADE;
DROP FUNCTION IF EXISTS current_device_id()               CASCADE;
DROP FUNCTION IF EXISTS analyst_has_device_access(UUID)   CASCADE;
DROP FUNCTION IF EXISTS get_device_id_from_headers()      CASCADE;
DROP FUNCTION IF EXISTS get_api_key_from_headers()        CASCADE;
DROP FUNCTION IF EXISTS is_user_approved()                CASCADE;
DROP FUNCTION IF EXISTS is_user_administrator()           CASCADE;

-- ─── Recreate helper functions ────────────────────────────────────────────────

-- is_admin(): checks analyst_users with RLS disabled to avoid recursion.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    result BOOLEAN;
BEGIN
    SET LOCAL row_security = off;
    SELECT EXISTS (
        SELECT 1 FROM public.analyst_users
        WHERE user_id  = auth.uid()
          AND role     = 'ADMINISTRATOR'
          AND is_active = TRUE
    ) INTO result;
    RETURN result;
END;
$$;

-- is_analyst_or_admin(): same pattern.
CREATE OR REPLACE FUNCTION is_analyst_or_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    result BOOLEAN;
BEGIN
    SET LOCAL row_security = off;
    SELECT EXISTS (
        SELECT 1 FROM public.analyst_users
        WHERE user_id  = auth.uid()
          AND role     IN ('ANALYST', 'ADMINISTRATOR')
          AND is_active = TRUE
    ) INTO result;
    RETURN result;
END;
$$;

-- is_user_approved(): also needs row_security off for the same reason.
CREATE OR REPLACE FUNCTION is_user_approved()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    result BOOLEAN;
BEGIN
    SET LOCAL row_security = off;
    SELECT EXISTS (
        SELECT 1 FROM public.analyst_users
        WHERE user_id         = auth.uid()
          AND is_active        = TRUE
          AND approval_status  = 'APPROVED'
    ) INTO result;
    RETURN result;
END;
$$;

-- is_user_administrator(): same pattern.
CREATE OR REPLACE FUNCTION is_user_administrator()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    result BOOLEAN;
BEGIN
    SET LOCAL row_security = off;
    SELECT EXISTS (
        SELECT 1 FROM public.analyst_users
        WHERE user_id         = auth.uid()
          AND is_active        = TRUE
          AND approval_status  = 'APPROVED'
          AND role             = 'ADMINISTRATOR'
    ) INTO result;
    RETURN result;
END;
$$;

-- get_device_id_from_headers(): pure header parsing, no table access — safe.
CREATE OR REPLACE FUNCTION get_device_id_from_headers()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    raw_header  TEXT;
    device_uuid UUID;
BEGIN
    raw_header := current_setting('request.headers', true);
    raw_header := (
        regexp_match(lower(raw_header), '"x-edgepulse-device-id"\s*:\s*"([^"]+)"')
    )[1];
    IF raw_header IS NULL THEN
        RETURN NULL;
    END IF;
    BEGIN
        device_uuid := raw_header::UUID;
        RETURN device_uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN NULL;
    END;
END;
$$;

-- get_api_key_from_headers(): pure header parsing, safe.
CREATE OR REPLACE FUNCTION get_api_key_from_headers()
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    raw_header TEXT;
BEGIN
    raw_header := current_setting('request.headers', true);
    RETURN (
        regexp_match(lower(raw_header), '"x-edgepulse-api-key"\s*:\s*"([^"]+)"')
    )[1];
END;
$$;

-- is_authenticated_device(): queries agent_api_keys (no RLS policy calls
-- is_admin/is_analyst_or_admin), but we still disable row_security to be safe.
CREATE OR REPLACE FUNCTION is_authenticated_device()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_device_id UUID;
    v_api_key   TEXT;
    v_key_hash  TEXT;
    result      BOOLEAN;
BEGIN
    v_device_id := get_device_id_from_headers();
    v_api_key   := get_api_key_from_headers();
    IF v_device_id IS NULL OR v_api_key IS NULL THEN
        RETURN FALSE;
    END IF;
    v_key_hash := encode(
        digest(v_api_key || 'ep-v1-' || v_device_id::TEXT, 'sha256'),
        'hex'
    );
    SET LOCAL row_security = off;
    SELECT EXISTS (
        SELECT 1 FROM public.agent_api_keys
        WHERE device_id  = v_device_id
          AND key_hash   = v_key_hash
          AND is_active  = TRUE
          AND (expires_at IS NULL OR expires_at > NOW())
    ) INTO result;
    RETURN result;
END;
$$;

-- current_device_id(): delegates to is_authenticated_device(), safe.
CREATE OR REPLACE FUNCTION current_device_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF is_authenticated_device() THEN
        RETURN get_device_id_from_headers();
    END IF;
    RETURN NULL;
END;
$$;

-- analyst_has_device_access(): inline the admin check with row_security off
-- to avoid chained recursion through analyst_device_assignments policies.
CREATE OR REPLACE FUNCTION analyst_has_device_access(p_device_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    result BOOLEAN;
BEGIN
    SET LOCAL row_security = off;
    SELECT (
        -- is admin?
        EXISTS (
            SELECT 1 FROM public.analyst_users
            WHERE user_id  = auth.uid()
              AND role     = 'ADMINISTRATOR'
              AND is_active = TRUE
        )
        OR
        -- has explicit assignment?
        EXISTS (
            SELECT 1 FROM public.analyst_device_assignments
            WHERE analyst_id = auth.uid()
              AND device_id  = p_device_id
              AND is_active  = TRUE
        )
    ) INTO result;
    RETURN result;
END;
$$;

-- ─── Recreate all RLS policies dropped by CASCADE ─────────────────────────────
-- (Only policies that directly referenced the dropped functions are gone.
--  We recreate them identically to the last-good state from migrations 002 + 007.)

-- ── analyst_users ────────────────────────────────────────────────────────────
-- Note: these replaced the originals in migration 007.
DROP POLICY IF EXISTS "analysts: view own profile"       ON analyst_users;
DROP POLICY IF EXISTS "admins: view all users"           ON analyst_users;
DROP POLICY IF EXISTS "admins: insert users"             ON analyst_users;
DROP POLICY IF EXISTS "admins: update users"             ON analyst_users;
DROP POLICY IF EXISTS "analysts: update own profile"     ON analyst_users;

CREATE POLICY "analysts: view own profile"
    ON analyst_users FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "admins: view all users"
    ON analyst_users FOR SELECT
    USING (is_admin());

CREATE POLICY "admins: insert users"
    ON analyst_users FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "admins: update users"
    ON analyst_users FOR UPDATE
    USING (is_admin());

CREATE POLICY "analysts: update own profile"
    ON analyst_users FOR UPDATE
    USING  (auth.uid() = user_id AND approval_status = 'APPROVED')
    WITH CHECK (
        auth.uid() = user_id
        AND approval_status = 'APPROVED'
        AND role = 'ANALYST'
    );

-- ── device_registry ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "devices: read own record"        ON device_registry;
DROP POLICY IF EXISTS "devices: update own heartbeat"   ON device_registry;
DROP POLICY IF EXISTS "analysts: read assigned devices" ON device_registry;
DROP POLICY IF EXISTS "admins: full device management"  ON device_registry;

CREATE POLICY "devices: read own record"
    ON device_registry FOR SELECT
    USING (id = current_device_id());

CREATE POLICY "devices: update own heartbeat"
    ON device_registry FOR UPDATE
    USING     (id = current_device_id())
    WITH CHECK (id = current_device_id());

CREATE POLICY "analysts: read assigned devices"
    ON device_registry FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(id));

CREATE POLICY "admins: full device management"
    ON device_registry FOR ALL
    USING (is_admin());

-- ── agent_api_keys ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admins: manage api keys" ON agent_api_keys;

CREATE POLICY "admins: manage api keys"
    ON agent_api_keys FOR ALL
    USING (is_admin());

-- ── device_enrollment_tokens ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "admins: manage enrollment tokens" ON device_enrollment_tokens;
DROP POLICY IF EXISTS "anon: read token for validation"  ON device_enrollment_tokens;

CREATE POLICY "admins: manage enrollment tokens"
    ON device_enrollment_tokens FOR ALL
    USING (is_admin());

CREATE POLICY "anon: read token for validation"
    ON device_enrollment_tokens FOR SELECT
    USING (TRUE);

-- ── telemetry_events ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "devices: insert own telemetry"     ON telemetry_events;
DROP POLICY IF EXISTS "analysts: read assigned telemetry" ON telemetry_events;

CREATE POLICY "devices: insert own telemetry"
    ON telemetry_events FOR INSERT
    WITH CHECK (device_id = current_device_id());

CREATE POLICY "analysts: read assigned telemetry"
    ON telemetry_events FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- ── feature_vectors ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "devices: insert own features"     ON feature_vectors;
DROP POLICY IF EXISTS "analysts: read assigned features" ON feature_vectors;

CREATE POLICY "devices: insert own features"
    ON feature_vectors FOR INSERT
    WITH CHECK (device_id = current_device_id());

CREATE POLICY "analysts: read assigned features"
    ON feature_vectors FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- ── anomaly_scores ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "devices: insert own scores"     ON anomaly_scores;
DROP POLICY IF EXISTS "analysts: read assigned scores" ON anomaly_scores;

CREATE POLICY "devices: insert own scores"
    ON anomaly_scores FOR INSERT
    WITH CHECK (device_id = current_device_id());

CREATE POLICY "analysts: read assigned scores"
    ON anomaly_scores FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- ── alert_records ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "devices: insert own alerts"     ON alert_records;
DROP POLICY IF EXISTS "analysts: read assigned alerts" ON alert_records;
DROP POLICY IF EXISTS "analysts: update alert status"  ON alert_records;

CREATE POLICY "devices: insert own alerts"
    ON alert_records FOR INSERT
    WITH CHECK (device_id = current_device_id());

CREATE POLICY "analysts: read assigned alerts"
    ON alert_records FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

CREATE POLICY "analysts: update alert status"
    ON alert_records FOR UPDATE
    USING     (is_analyst_or_admin() AND analyst_has_device_access(device_id))
    WITH CHECK (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- ── tamper_evident_log ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "devices: insert own log entries" ON tamper_evident_log;
DROP POLICY IF EXISTS "analysts: read log entries"      ON tamper_evident_log;

CREATE POLICY "devices: insert own log entries"
    ON tamper_evident_log FOR INSERT
    WITH CHECK (device_id = current_device_id());

CREATE POLICY "analysts: read log entries"
    ON tamper_evident_log FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- ── device_health_snapshots ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "devices: insert own health"     ON device_health_snapshots;
DROP POLICY IF EXISTS "analysts: read assigned health" ON device_health_snapshots;

CREATE POLICY "devices: insert own health"
    ON device_health_snapshots FOR INSERT
    WITH CHECK (device_id = current_device_id());

CREATE POLICY "analysts: read assigned health"
    ON device_health_snapshots FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- ── analyst_device_assignments ───────────────────────────────────────────────
DROP POLICY IF EXISTS "analysts: view own assignments" ON analyst_device_assignments;
DROP POLICY IF EXISTS "admins: view all assignments"   ON analyst_device_assignments;
DROP POLICY IF EXISTS "admins: manage assignments"     ON analyst_device_assignments;

CREATE POLICY "analysts: view own assignments"
    ON analyst_device_assignments FOR SELECT
    USING (auth.uid() = analyst_id);

CREATE POLICY "admins: view all assignments"
    ON analyst_device_assignments FOR SELECT
    USING (is_admin());

CREATE POLICY "admins: manage assignments"
    ON analyst_device_assignments FOR ALL
    USING (is_admin());

-- ── incident_cases ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "analysts: read own or assigned cases"   ON incident_cases;
DROP POLICY IF EXISTS "analysts: create cases"                 ON incident_cases;
DROP POLICY IF EXISTS "analysts: update own or assigned cases" ON incident_cases;

CREATE POLICY "analysts: read own or assigned cases"
    ON incident_cases FOR SELECT
    USING (
        is_analyst_or_admin()
        AND (created_by = auth.uid() OR assigned_to = auth.uid() OR is_admin())
    );

CREATE POLICY "analysts: create cases"
    ON incident_cases FOR INSERT
    WITH CHECK (is_analyst_or_admin() AND created_by = auth.uid());

CREATE POLICY "analysts: update own or assigned cases"
    ON incident_cases FOR UPDATE
    USING (
        is_analyst_or_admin()
        AND (created_by = auth.uid() OR assigned_to = auth.uid() OR is_admin())
    );

-- ── case_alerts ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "analysts: manage case alerts" ON case_alerts;

CREATE POLICY "analysts: manage case alerts"
    ON case_alerts FOR ALL
    USING (
        is_analyst_or_admin()
        AND EXISTS (
            SELECT 1 FROM incident_cases ic
            WHERE ic.id = case_alerts.case_id
              AND (ic.created_by = auth.uid() OR ic.assigned_to = auth.uid() OR is_admin())
        )
    );

-- ── case_notes ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "analysts: manage case notes" ON case_notes;

CREATE POLICY "analysts: manage case notes"
    ON case_notes FOR ALL
    USING (
        is_analyst_or_admin()
        AND EXISTS (
            SELECT 1 FROM incident_cases ic
            WHERE ic.id = case_notes.case_id
              AND (ic.created_by = auth.uid() OR ic.assigned_to = auth.uid() OR is_admin())
        )
    );

-- ── audit_trail ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "analysts: read audit trail" ON audit_trail;

CREATE POLICY "analysts: read audit trail"
    ON audit_trail FOR SELECT
    USING (is_analyst_or_admin());

-- ── notification_rules ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admins: manage notification rules" ON notification_rules;
DROP POLICY IF EXISTS "analysts: read own rules"          ON notification_rules;

CREATE POLICY "admins: manage notification rules"
    ON notification_rules FOR ALL
    USING (is_admin());

CREATE POLICY "analysts: read own rules"
    ON notification_rules FOR SELECT
    USING (is_analyst_or_admin() AND created_by = auth.uid());

-- ── agent_config ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "devices: read own config" ON agent_config;
DROP POLICY IF EXISTS "admins: manage config"    ON agent_config;

CREATE POLICY "devices: read own config"
    ON agent_config FOR SELECT
    USING (device_id = current_device_id() OR device_id IS NULL);

CREATE POLICY "admins: manage config"
    ON agent_config FOR ALL
    USING (is_admin());

-- ── privacy_settings ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users: read privacy settings"   ON privacy_settings;
DROP POLICY IF EXISTS "users: insert privacy settings" ON privacy_settings;
DROP POLICY IF EXISTS "users: update privacy settings" ON privacy_settings;
DROP POLICY IF EXISTS "admins: manage privacy settings" ON privacy_settings;

CREATE POLICY "users: read privacy settings"
    ON privacy_settings FOR SELECT
    USING (
        device_id IS NULL
        OR device_id = current_device_id()
        OR (is_analyst_or_admin() AND analyst_has_device_access(device_id))
    );

CREATE POLICY "users: insert privacy settings"
    ON privacy_settings FOR INSERT
    WITH CHECK (
        device_id IS NULL
        OR device_id = current_device_id()
        OR (is_analyst_or_admin() AND analyst_has_device_access(device_id))
    );

CREATE POLICY "users: update privacy settings"
    ON privacy_settings FOR UPDATE
    USING (
        device_id IS NULL
        OR device_id = current_device_id()
        OR (is_analyst_or_admin() AND analyst_has_device_access(device_id))
    )
    WITH CHECK (
        device_id IS NULL
        OR device_id = current_device_id()
        OR (is_analyst_or_admin() AND analyst_has_device_access(device_id))
    );

-- ── sync_queue ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "devices: manage own sync queue" ON sync_queue;
DROP POLICY IF EXISTS "analysts: read sync queue"      ON sync_queue;
DROP POLICY IF EXISTS "admins: manage all sync queue"  ON sync_queue;

CREATE POLICY "devices: manage own sync queue"
    ON sync_queue FOR ALL
    USING (device_id = current_device_id());

CREATE POLICY "analysts: read sync queue"
    ON sync_queue FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

CREATE POLICY "admins: manage all sync queue"
    ON sync_queue FOR ALL
    USING (is_admin());

-- ── retention_settings ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "analysts: read retention settings" ON retention_settings;
DROP POLICY IF EXISTS "admins: manage retention settings" ON retention_settings;

CREATE POLICY "analysts: read retention settings"
    ON retention_settings FOR SELECT
    USING (is_analyst_or_admin());

CREATE POLICY "admins: manage retention settings"
    ON retention_settings FOR ALL
    USING (is_admin());