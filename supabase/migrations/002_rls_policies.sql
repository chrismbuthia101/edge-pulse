-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 002_rls_policies
-- Description: Row-level security for all tables
-- ============================================================

-- Enable RLS
ALTER TABLE analyst_users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_registry            ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_api_keys             ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_enrollment_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_config               ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_vectors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_scores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_records              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tamper_evident_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_health_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyst_device_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_cases             ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_alerts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_notes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail                ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_settings         ENABLE ROW LEVEL SECURITY;

-- ─── Helper functions ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM analyst_users
        WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR' AND is_active = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION is_analyst_or_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM analyst_users
        WHERE user_id = auth.uid() AND role IN ('ANALYST','ADMINISTRATOR') AND is_active = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION get_device_id_from_headers()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    raw_header  TEXT;
    device_uuid UUID;
BEGIN
    raw_header := current_setting('request.headers', true);
    raw_header := (
        regexp_match(lower(raw_header), '"x-edgepulse-device-id"\s*:\s*"([^"]+)"')
    )[1];
    IF raw_header IS NULL THEN RETURN NULL; END IF;
    BEGIN
        device_uuid := raw_header::UUID;
        RETURN device_uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN NULL;
    END;
END;
$$;

CREATE OR REPLACE FUNCTION get_api_key_from_headers()
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE raw_header TEXT;
BEGIN
    raw_header := current_setting('request.headers', true);
    RETURN (
        regexp_match(lower(raw_header), '"x-edgepulse-api-key"\s*:\s*"([^"]+)"')
    )[1];
END;
$$;

CREATE OR REPLACE FUNCTION is_authenticated_device()
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_device_id UUID;
    v_api_key   TEXT;
    v_key_hash  TEXT;
BEGIN
    v_device_id := get_device_id_from_headers();
    v_api_key   := get_api_key_from_headers();
    IF v_device_id IS NULL OR v_api_key IS NULL THEN RETURN FALSE; END IF;
    v_key_hash := encode(digest(v_api_key || 'ep-v1-' || v_device_id::TEXT, 'sha256'), 'hex');
    RETURN EXISTS (
        SELECT 1 FROM agent_api_keys
        WHERE device_id = v_device_id
          AND key_hash  = v_key_hash
          AND is_active = TRUE
          AND (expires_at IS NULL OR expires_at > NOW())
    );
END;
$$;

CREATE OR REPLACE FUNCTION current_device_id()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
    IF is_authenticated_device() THEN RETURN get_device_id_from_headers(); END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION analyst_has_device_access(p_device_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
    SELECT is_admin()
        OR EXISTS (
            SELECT 1 FROM analyst_device_assignments
            WHERE analyst_id = auth.uid()
              AND device_id  = p_device_id
              AND is_active  = TRUE
        );
$$;

-- ─── analyst_users ────────────────────────────────────────────
CREATE POLICY "analysts: view own profile"   ON analyst_users FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admins: view all users"       ON analyst_users FOR SELECT USING (is_admin());
CREATE POLICY "admins: insert users"         ON analyst_users FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "admins: update users"         ON analyst_users FOR UPDATE USING (is_admin());
CREATE POLICY "analysts: update own profile" ON analyst_users FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ─── device_registry ──────────────────────────────────────────
CREATE POLICY "devices: read own record"         ON device_registry FOR SELECT USING (id = current_device_id());
CREATE POLICY "devices: update own heartbeat"    ON device_registry FOR UPDATE USING (id = current_device_id()) WITH CHECK (id = current_device_id());
CREATE POLICY "analysts: read assigned devices"  ON device_registry FOR SELECT USING (is_analyst_or_admin() AND analyst_has_device_access(id));
CREATE POLICY "admins: full device management"   ON device_registry FOR ALL   USING (is_admin());

-- ─── agent_api_keys ───────────────────────────────────────────
CREATE POLICY "admins: manage api keys" ON agent_api_keys FOR ALL USING (is_admin());

-- ─── device_enrollment_tokens ─────────────────────────────────
CREATE POLICY "admins: manage enrollment tokens" ON device_enrollment_tokens FOR ALL    USING (is_admin());
CREATE POLICY "anon: read token for validation"  ON device_enrollment_tokens FOR SELECT USING (TRUE);

-- ─── telemetry_events ─────────────────────────────────────────
CREATE POLICY "devices: insert own telemetry"    ON telemetry_events FOR INSERT WITH CHECK (device_id = current_device_id());
CREATE POLICY "analysts: read assigned telemetry" ON telemetry_events FOR SELECT USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- ─── feature_vectors ──────────────────────────────────────────
CREATE POLICY "devices: insert own features"    ON feature_vectors FOR INSERT WITH CHECK (device_id = current_device_id());
CREATE POLICY "analysts: read assigned features" ON feature_vectors FOR SELECT USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- ─── anomaly_scores ───────────────────────────────────────────
CREATE POLICY "devices: insert own scores"    ON anomaly_scores FOR INSERT WITH CHECK (device_id = current_device_id());
CREATE POLICY "analysts: read assigned scores" ON anomaly_scores FOR SELECT USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- ─── alert_records ────────────────────────────────────────────
CREATE POLICY "devices: insert own alerts"   ON alert_records FOR INSERT WITH CHECK (device_id = current_device_id());
CREATE POLICY "analysts: read assigned alerts" ON alert_records FOR SELECT USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));
CREATE POLICY "analysts: update alert status"  ON alert_records FOR UPDATE
    USING (is_analyst_or_admin() AND analyst_has_device_access(device_id))
    WITH CHECK (
        is_analyst_or_admin()
        AND analyst_has_device_access(device_id)
    );

-- ─── tamper_evident_log ───────────────────────────────────────
CREATE POLICY "devices: insert own log entries" ON tamper_evident_log FOR INSERT WITH CHECK (device_id = current_device_id());
CREATE POLICY "analysts: read log entries"      ON tamper_evident_log FOR SELECT USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- ─── device_health_snapshots ──────────────────────────────────
CREATE POLICY "devices: insert own health"    ON device_health_snapshots FOR INSERT WITH CHECK (device_id = current_device_id());
CREATE POLICY "analysts: read assigned health" ON device_health_snapshots FOR SELECT USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));

-- ─── analyst_device_assignments ───────────────────────────────
CREATE POLICY "admins: manage assignments"     ON analyst_device_assignments FOR ALL    USING (is_admin());
CREATE POLICY "analysts: view own assignments" ON analyst_device_assignments FOR SELECT USING (analyst_id = auth.uid());

-- ─── incident_cases ───────────────────────────────────────────
CREATE POLICY "analysts: read own or assigned cases" ON incident_cases FOR SELECT
    USING (is_analyst_or_admin() AND (created_by = auth.uid() OR assigned_to = auth.uid() OR is_admin()));
CREATE POLICY "analysts: create cases" ON incident_cases FOR INSERT
    WITH CHECK (is_analyst_or_admin() AND created_by = auth.uid());
CREATE POLICY "analysts: update own or assigned cases" ON incident_cases FOR UPDATE
    USING (is_analyst_or_admin() AND (created_by = auth.uid() OR assigned_to = auth.uid() OR is_admin()));

-- ─── case_alerts ──────────────────────────────────────────────
CREATE POLICY "analysts: manage case alerts" ON case_alerts FOR ALL
    USING (
        is_analyst_or_admin()
        AND EXISTS (
            SELECT 1 FROM incident_cases ic
            WHERE ic.id = case_alerts.case_id
              AND (ic.created_by = auth.uid() OR ic.assigned_to = auth.uid() OR is_admin())
        )
    );

-- ─── case_notes ───────────────────────────────────────────────
CREATE POLICY "analysts: manage case notes" ON case_notes FOR ALL
    USING (
        is_analyst_or_admin()
        AND EXISTS (
            SELECT 1 FROM incident_cases ic
            WHERE ic.id = case_notes.case_id
              AND (ic.created_by = auth.uid() OR ic.assigned_to = auth.uid() OR is_admin())
        )
    );

-- ─── audit_trail ──────────────────────────────────────────────
CREATE POLICY "analysts: read audit trail" ON audit_trail FOR SELECT USING (is_analyst_or_admin());

-- ─── notification_rules ───────────────────────────────────────
CREATE POLICY "admins: manage notification rules" ON notification_rules FOR ALL    USING (is_admin());
CREATE POLICY "analysts: read own rules"          ON notification_rules FOR SELECT USING (is_analyst_or_admin() AND created_by = auth.uid());

-- ─── agent_config ─────────────────────────────────────────────
CREATE POLICY "devices: read own config" ON agent_config FOR SELECT USING (device_id = current_device_id() OR device_id IS NULL);
CREATE POLICY "admins: manage config"    ON agent_config FOR ALL   USING (is_admin());

-- ─── privacy_settings ─────────────────────────────────────────
CREATE POLICY "devices: read own privacy settings"      ON privacy_settings FOR SELECT USING (device_id = current_device_id() OR device_id IS NULL);
CREATE POLICY "analysts: read assigned privacy settings" ON privacy_settings FOR SELECT USING (is_analyst_or_admin() AND (device_id IS NULL OR analyst_has_device_access(device_id)));
CREATE POLICY "admins: manage privacy settings"         ON privacy_settings FOR ALL   USING (is_admin());

-- ─── sync_queue ───────────────────────────────────────────────
CREATE POLICY "devices: manage own sync queue" ON sync_queue FOR ALL   USING (device_id = current_device_id());
CREATE POLICY "analysts: read sync queue"      ON sync_queue FOR SELECT USING (is_analyst_or_admin() AND analyst_has_device_access(device_id));
CREATE POLICY "admins: manage all sync queue"  ON sync_queue FOR ALL   USING (is_admin());

-- ─── retention_settings ───────────────────────────────────────
CREATE POLICY "analysts: read retention settings" ON retention_settings FOR SELECT USING (is_analyst_or_admin());
CREATE POLICY "admins: manage retention settings" ON retention_settings FOR ALL   USING (is_admin());

-- ─── Grants ───────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON device_enrollment_tokens TO anon;

GRANT SELECT, INSERT, UPDATE ON analyst_users              TO authenticated;
GRANT SELECT, UPDATE          ON device_registry           TO authenticated;
GRANT SELECT                  ON agent_api_keys            TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON device_enrollment_tokens  TO authenticated;
GRANT SELECT                  ON telemetry_events          TO authenticated;
GRANT SELECT                  ON feature_vectors           TO authenticated;
GRANT SELECT                  ON anomaly_scores            TO authenticated;
GRANT SELECT, UPDATE          ON alert_records             TO authenticated;
GRANT SELECT                  ON tamper_evident_log        TO authenticated;
GRANT SELECT                  ON device_health_snapshots   TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON analyst_device_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON incident_cases            TO authenticated;
GRANT SELECT, INSERT          ON case_alerts               TO authenticated;
GRANT SELECT, INSERT          ON case_notes                TO authenticated;
GRANT SELECT                  ON audit_trail               TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON notification_rules        TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON agent_config              TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON privacy_settings          TO authenticated;
GRANT SELECT                  ON sync_queue                TO authenticated;
GRANT SELECT                  ON retention_settings        TO authenticated;
GRANT USAGE                   ON SEQUENCE case_seq         TO authenticated;