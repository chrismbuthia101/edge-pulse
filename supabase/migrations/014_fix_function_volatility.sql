-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 014_fix_function_volatility
-- Description: Fix function volatility for functions using SET LOCAL
--
-- PROBLEM:
--   Functions is_admin(), is_analyst_or_admin(), is_user_approved(),
--   is_user_administrator(), and analyst_has_device_access() are defined
--   as STABLE but contain SET LOCAL row_security = off; statements.
--
--   PostgreSQL error: "SET is not allowed in a non-volatile function"
--   because SET LOCAL modifies database state.
--
-- SOLUTION:
--   Change function volatility from STABLE to VOLATILE for all functions
--   that use SET LOCAL statements. VOLATILE is the correct volatility
--   classification for functions that modify database state.
-- ============================================================

-- Drop and recreate functions with correct volatility (VOLATILE instead of STABLE)

DROP FUNCTION IF EXISTS is_admin()                        CASCADE;
DROP FUNCTION IF EXISTS is_analyst_or_admin()             CASCADE;
DROP FUNCTION IF EXISTS is_user_approved()                CASCADE;
DROP FUNCTION IF EXISTS is_user_administrator()           CASCADE;
DROP FUNCTION IF EXISTS analyst_has_device_access(UUID)   CASCADE;

-- is_admin(): VOLATILE due to SET LOCAL
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
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

-- is_analyst_or_admin(): VOLATILE due to SET LOCAL
CREATE OR REPLACE FUNCTION is_analyst_or_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
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

-- is_user_approved(): VOLATILE due to SET LOCAL
CREATE OR REPLACE FUNCTION is_user_approved()
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
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

-- is_user_administrator(): VOLATILE due to SET LOCAL
CREATE OR REPLACE FUNCTION is_user_administrator()
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
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

-- analyst_has_device_access(): VOLATILE due to SET LOCAL
CREATE OR REPLACE FUNCTION analyst_has_device_access(p_device_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
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

-- Recreate RLS policies that depended on the dropped functions
-- (These are the same policies from migration 010)

-- First drop all policies to avoid conflicts
-- analyst_users policies
DROP POLICY IF EXISTS "analysts: view own profile"       ON analyst_users;
DROP POLICY IF EXISTS "admins: view all users"           ON analyst_users;
DROP POLICY IF EXISTS "admins: insert users"             ON analyst_users;
DROP POLICY IF EXISTS "admins: update users"             ON analyst_users;
DROP POLICY IF EXISTS "analysts: update own profile"     ON analyst_users;

-- device_registry policies
DROP POLICY IF EXISTS "devices: read own record"        ON device_registry;
DROP POLICY IF EXISTS "devices: update own heartbeat"   ON device_registry;
DROP POLICY IF EXISTS "analysts: read assigned devices" ON device_registry;
DROP POLICY IF EXISTS "admins: full device management"  ON device_registry;

-- agent_api_keys policies
DROP POLICY IF EXISTS "admins: manage api keys" ON agent_api_keys;

-- device_enrollment_tokens policies
DROP POLICY IF EXISTS "admins: manage enrollment tokens" ON device_enrollment_tokens;
DROP POLICY IF EXISTS "anon: read token for validation"  ON device_enrollment_tokens;

-- telemetry_events policies
DROP POLICY IF EXISTS "devices: insert own telemetry"     ON telemetry_events;
DROP POLICY IF EXISTS "analysts: read assigned telemetry" ON telemetry_events;

-- feature_vectors policies
DROP POLICY IF EXISTS "devices: insert own features"     ON feature_vectors;
DROP POLICY IF EXISTS "analysts: read assigned features" ON feature_vectors;

-- anomaly_scores policies
DROP POLICY IF EXISTS "devices: insert own scores"     ON anomaly_scores;
DROP POLICY IF EXISTS "analysts: read assigned scores" ON anomaly_scores;

-- alert_records policies
DROP POLICY IF EXISTS "devices: insert own alerts"     ON alert_records;
DROP POLICY IF EXISTS "analysts: read assigned alerts" ON alert_records;
DROP POLICY IF EXISTS "analysts: update alert status"  ON alert_records;

-- tamper_evident_log policies
DROP POLICY IF EXISTS "devices: insert own log entries" ON tamper_evident_log;
DROP POLICY IF EXISTS "analysts: read log entries"      ON tamper_evident_log;

-- device_health_snapshots policies
DROP POLICY IF EXISTS "devices: insert own health"     ON device_health_snapshots;
DROP POLICY IF EXISTS "analysts: read assigned health" ON device_health_snapshots;

-- analyst_device_assignments policies
DROP POLICY IF EXISTS "analysts: view own assignments" ON analyst_device_assignments;
DROP POLICY IF EXISTS "admins: view all assignments"   ON analyst_device_assignments;
DROP POLICY IF EXISTS "admins: manage assignments"     ON analyst_device_assignments;

-- incident_cases policies
DROP POLICY IF EXISTS "analysts: read own or assigned cases"   ON incident_cases;
DROP POLICY IF EXISTS "analysts: create cases"                 ON incident_cases;
DROP POLICY IF EXISTS "analysts: update own or assigned cases" ON incident_cases;

-- case_alerts policies
DROP POLICY IF EXISTS "analysts: manage case alerts" ON case_alerts;

-- case_notes policies
DROP POLICY IF EXISTS "analysts: manage case notes" ON case_notes;

-- audit_trail policies
DROP POLICY IF EXISTS "analysts: read audit trail" ON audit_trail;

-- notification_rules policies
DROP POLICY IF EXISTS "admins: manage notification rules" ON notification_rules;
DROP POLICY IF EXISTS "analysts: read own rules"          ON notification_rules;

-- agent_config policies
DROP POLICY IF EXISTS "devices: read own config" ON agent_config;
DROP POLICY IF EXISTS "admins: manage config"    ON agent_config;

-- privacy_settings policies
DROP POLICY IF EXISTS "users: read privacy settings"   ON privacy_settings;
DROP POLICY IF EXISTS "users: insert privacy settings" ON privacy_settings;
DROP POLICY IF EXISTS "users: update privacy settings" ON privacy_settings;
DROP POLICY IF EXISTS "admins: manage privacy settings" ON privacy_settings;

-- sync_queue policies
DROP POLICY IF EXISTS "devices: manage own sync queue" ON sync_queue;
DROP POLICY IF EXISTS "analysts: read sync queue"      ON sync_queue;
DROP POLICY IF EXISTS "admins: manage all sync queue"  ON sync_queue;

-- retention_settings policies
DROP POLICY IF EXISTS "analysts: read retention settings" ON retention_settings;
DROP POLICY IF EXISTS "admins: manage retention settings" ON retention_settings;

-- Now recreate all policies
-- analyst_users policies
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

-- device_registry policies
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

-- agent_api_keys policies
CREATE POLICY "admins: manage api keys"
    ON agent_api_keys FOR ALL
    USING (is_admin());

-- device_enrollment_tokens policies
CREATE POLICY "admins: manage enrollment tokens"
    ON device_enrollment_tokens FOR ALL
    USING (is_admin());

CREATE POLICY "anon: read token for validation"
    ON device_enrollment_tokens FOR SELECT
    USING (TRUE);

-- telemetry_events policies
CREATE POLICY "devices: insert own telemetry"
    ON telemetry_events FOR INSERT
    WITH CHECK (device_id = current_device_id());

CREATE POLICY "analysts: read assigned telemetry"
    ON telemetry_events FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- feature_vectors policies
CREATE POLICY "devices: insert own features"
    ON feature_vectors FOR INSERT
    WITH CHECK (device_id = current_device_id());

CREATE POLICY "analysts: read assigned features"
    ON feature_vectors FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- anomaly_scores policies
CREATE POLICY "devices: insert own scores"
    ON anomaly_scores FOR INSERT
    WITH CHECK (device_id = current_device_id());

CREATE POLICY "analysts: read assigned scores"
    ON anomaly_scores FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- alert_records policies
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

-- tamper_evident_log policies
CREATE POLICY "devices: insert own log entries"
    ON tamper_evident_log FOR INSERT
    WITH CHECK (device_id = current_device_id());

CREATE POLICY "analysts: read log entries"
    ON tamper_evident_log FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- device_health_snapshots policies
CREATE POLICY "devices: insert own health"
    ON device_health_snapshots FOR INSERT
    WITH CHECK (device_id = current_device_id());

CREATE POLICY "analysts: read assigned health"
    ON device_health_snapshots FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- analyst_device_assignments policies
CREATE POLICY "analysts: view own assignments"
    ON analyst_device_assignments FOR SELECT
    USING (auth.uid() = analyst_id);

CREATE POLICY "admins: view all assignments"
    ON analyst_device_assignments FOR SELECT
    USING (is_admin());

CREATE POLICY "admins: manage assignments"
    ON analyst_device_assignments FOR ALL
    USING (is_admin());

-- incident_cases policies
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

-- case_alerts policies
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

-- case_notes policies
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

-- audit_trail policies
CREATE POLICY "analysts: read audit trail"
    ON audit_trail FOR SELECT
    USING (is_analyst_or_admin());

-- notification_rules policies
CREATE POLICY "admins: manage notification rules"
    ON notification_rules FOR ALL
    USING (is_admin());

CREATE POLICY "analysts: read own rules"
    ON notification_rules FOR SELECT
    USING (is_analyst_or_admin() AND created_by = auth.uid());

-- agent_config policies
CREATE POLICY "devices: read own config"
    ON agent_config FOR SELECT
    USING (device_id = current_device_id() OR device_id IS NULL);

CREATE POLICY "admins: manage config"
    ON agent_config FOR ALL
    USING (is_admin());

-- privacy_settings policies
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

-- sync_queue policies
CREATE POLICY "devices: manage own sync queue"
    ON sync_queue FOR ALL
    USING (device_id = current_device_id());

CREATE POLICY "analysts: read sync queue"
    ON sync_queue FOR SELECT
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

CREATE POLICY "admins: manage all sync queue"
    ON sync_queue FOR ALL
    USING (is_admin());

-- retention_settings policies
CREATE POLICY "analysts: read retention settings"
    ON retention_settings FOR SELECT
    USING (is_analyst_or_admin());

CREATE POLICY "admins: manage retention settings"
    ON retention_settings FOR ALL
    USING (is_admin());
