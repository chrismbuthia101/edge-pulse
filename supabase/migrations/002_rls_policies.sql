-- ============================================================
-- EdgePulse Schema v3.0.0 — Multi-Tenant
-- Migration: 002_rls_policies
-- Description: RLS policies, helper functions, grants, realtime.
-- ============================================================

-- ─── Enable RLS on all tables ────────────────────────────────────────────────
ALTER TABLE organization.organizations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization.billing           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices.api_keys               ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices.enrollment_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices.config                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry.events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry.feature_vectors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry.anomaly_scores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry.device_health        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_assignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.sync_queue            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.models                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications           ENABLE ROW LEVEL SECURITY;

-- ─── Schema usage grants ───────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public       TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions   TO authenticated, service_role;
GRANT USAGE ON SCHEMA devices      TO authenticated, service_role;
GRANT USAGE ON SCHEMA telemetry    TO authenticated, service_role;
GRANT USAGE ON SCHEMA internal     TO authenticated, service_role;
GRANT USAGE ON SCHEMA organization TO authenticated, service_role;

-- ─── Helper functions ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION internal.current_organization_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, internal
AS $$
DECLARE
    v_org_id TEXT;
BEGIN
    SET LOCAL row_security = off;
    BEGIN
        v_org_id := current_setting('request.jwt.claims', true)::json->>'organization_id';
        IF v_org_id IS NOT NULL THEN
            RETURN v_org_id::UUID;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    SELECT organization_id::TEXT INTO v_org_id
    FROM public.users
    WHERE id = auth.uid() AND account_status = 'ACTIVE';
    IF v_org_id IS NOT NULL THEN
        RETURN v_org_id::UUID;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION internal.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, internal
AS $$
DECLARE result BOOLEAN;
BEGIN
    SET LOCAL row_security = off;
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id             = (SELECT auth.uid())
          AND role           = 'PLATFORM_ADMIN'
          AND account_status = 'ACTIVE'
    ) INTO result;
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION internal.is_org_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, internal
AS $$
DECLARE result BOOLEAN;
BEGIN
    SET LOCAL row_security = off;
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id             = (SELECT auth.uid())
          AND role           = 'ORG_ADMIN'
          AND account_status = 'ACTIVE'
    ) INTO result;
    RETURN result;
END;
$$;

-- ─── Platform Infrastructure Views (zero-trust aggregates) ───────────────────────
-- These views check is_platform_admin() internally, exposing only aggregate
-- statistics — never individual tenant rows. This enforces zero-trust:

CREATE VIEW internal.platform_device_summary AS
SELECT
    o.id            AS organization_id,
    o.name          AS organization_name,
    COUNT(d.id)::INTEGER           AS total_devices,
    COUNT(d.id) FILTER (WHERE d.status = 'online')::INTEGER       AS online,
    COUNT(d.id) FILTER (WHERE d.status = 'offline')::INTEGER      AS offline,
    COUNT(d.id) FILTER (WHERE d.status = 'gone_silent')::INTEGER  AS gone_silent,
    COUNT(d.id) FILTER (WHERE d.status = 'unsynced')::INTEGER     AS unsynced,
    COUNT(d.id) FILTER (WHERE d.status = 'isolated')::INTEGER     AS isolated,
    COUNT(d.id) FILTER (WHERE d.is_active = false)::INTEGER       AS deactivated,
    COUNT(d.id) FILTER (WHERE d.risk IN ('high','critical'))::INTEGER AS high_risk,
    COUNT(d.id) FILTER (WHERE d.risk = 'critical')::INTEGER       AS critical_risk
FROM organization.organizations o
LEFT JOIN public.devices d ON d.organization_id = o.id
WHERE (SELECT internal.is_platform_admin())
GROUP BY o.id, o.name;

CREATE VIEW internal.platform_user_summary AS
SELECT
    organization_id,
    COUNT(*)::INTEGER AS total_users,
    COUNT(*) FILTER (WHERE role = 'ORG_ADMIN')::INTEGER       AS admins,
    COUNT(*) FILTER (WHERE role = 'ORG_ANALYST')::INTEGER     AS analysts,
    COUNT(*) FILTER (WHERE account_status = 'ACTIVE')::INTEGER  AS active,
    COUNT(*) FILTER (WHERE account_status = 'PENDING')::INTEGER AS pending,
    COUNT(*) FILTER (WHERE account_status = 'SUSPENDED')::INTEGER AS suspended
FROM public.users
WHERE (SELECT internal.is_platform_admin())
GROUP BY organization_id;

CREATE VIEW internal.platform_event_volume AS
SELECT
    organization_id,
    source,
    COUNT(*)::INTEGER AS event_count,
    MIN(collected_at) AS earliest,
    MAX(collected_at) AS latest
FROM telemetry.events
WHERE (SELECT internal.is_platform_admin())
  AND collected_at > NOW() - INTERVAL '24 hours'
GROUP BY organization_id, source;

-- Device authentication helpers
CREATE OR REPLACE FUNCTION internal.get_device_id_from_headers()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, internal
AS $$
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

CREATE OR REPLACE FUNCTION internal.get_api_key_from_headers()
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, internal
AS $$
DECLARE raw_header TEXT;
BEGIN
    raw_header := current_setting('request.headers', true);
    RETURN (
        regexp_match(lower(raw_header), '"x-edgepulse-api-key"\s*:\s*"([^"]+)"')
    )[1];
END;
$$;

CREATE OR REPLACE FUNCTION internal.is_authenticated_device()
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, internal
AS $$
DECLARE
    v_device_id UUID;
    v_api_key   TEXT;
    v_key_hash  TEXT;
    result      BOOLEAN;
BEGIN
    v_device_id := internal.get_device_id_from_headers();
    v_api_key   := internal.get_api_key_from_headers();
    IF v_device_id IS NULL OR v_api_key IS NULL THEN RETURN FALSE; END IF;
    v_key_hash := encode(
        digest(v_api_key || 'ep-v1-' || v_device_id::TEXT, 'sha256'),
        'hex'
    );
    SET LOCAL row_security = off;
    SELECT EXISTS (
        SELECT 1 FROM devices.api_keys
        WHERE device_id  = v_device_id
          AND key_hash   = v_key_hash
          AND is_active  = TRUE
          AND (expires_at IS NULL OR expires_at > NOW())
    ) INTO result;
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION internal.current_device_id()
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public, internal
AS $$
BEGIN
    IF internal.is_authenticated_device() THEN
        RETURN internal.get_device_id_from_headers();
    END IF;
    RETURN NULL;
END;
$$;

-- Organization-scoped device access check
CREATE OR REPLACE FUNCTION internal.user_has_device_access(p_device_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, internal
AS $$
DECLARE
    v_user_role    user_role;
    v_user_org     UUID;
    v_device_org   UUID;
    result         BOOLEAN;
BEGIN
    SET LOCAL row_security = off;

    SELECT role, organization_id INTO v_user_role, v_user_org
    FROM public.users
    WHERE id = auth.uid() AND account_status = 'ACTIVE';

    IF v_user_role IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_user_role = 'PLATFORM_ADMIN' THEN
        RETURN FALSE;
    END IF;

    SELECT organization_id INTO v_device_org
    FROM public.devices
    WHERE id = p_device_id;

    IF v_device_org IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_user_org IS DISTINCT FROM v_device_org THEN
        RETURN FALSE;
    END IF;

    IF v_user_role = 'ORG_ADMIN' THEN
        RETURN TRUE;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.device_assignments
        WHERE user_id  = (SELECT auth.uid())
          AND device_id = p_device_id
          AND is_active = TRUE
    ) INTO result;

    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION internal.get_user_assigned_devices()
RETURNS TABLE(device_id UUID, device_name TEXT, device_type TEXT, device_status TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, internal
AS $$
BEGIN
    SET LOCAL row_security = off;
    RETURN QUERY
    SELECT d.id, d.name, d.type::TEXT, d.status::TEXT
    FROM public.devices d
    JOIN public.device_assignments da ON d.id = da.device_id
    WHERE da.user_id  = (SELECT auth.uid())
      AND da.is_active = TRUE
      AND d.is_active  = TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION internal.validate_enrollment_token(p_token TEXT)
RETURNS TABLE(valid BOOLEAN, token_id UUID)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_key_hash TEXT;
BEGIN
    SET LOCAL row_security = off;
    v_key_hash := encode(digest(p_token, 'sha256'), 'hex');
    RETURN QUERY
    SELECT
        (et.expires_at > NOW() AND et.current_uses < et.max_uses) AS valid,
        et.id
    FROM devices.enrollment_tokens et
    WHERE et.token_hash = v_key_hash
    LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_enrollment_token(p_token TEXT)
RETURNS TABLE(valid BOOLEAN, token_id UUID)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN QUERY SELECT * FROM internal.validate_enrollment_token(p_token);
END;
$$;

-- ─── RLS Policies ─────────────────────────────────────────────────────────────

-- ── organization.organizations ───────────────────────────────────────────────
CREATE POLICY "platform_admins: manage organizations"
    ON organization.organizations FOR ALL
    USING ((SELECT internal.is_platform_admin()));

CREATE POLICY "org_admins: view own organization"
    ON organization.organizations FOR SELECT
    USING ((SELECT internal.is_org_admin()) AND id = (SELECT internal.current_organization_id()));

-- ── organization.billing ────────────────────────────────────────────────────
CREATE POLICY "platform_admins: manage billing"
    ON organization.billing FOR ALL
    USING ((SELECT internal.is_platform_admin()));

CREATE POLICY "org_admins: view own billing"
    ON organization.billing FOR SELECT
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

-- ── users ───────────────────────────────────────────────────────────────────
CREATE POLICY "org_admins: view organization users"
    ON public.users FOR SELECT
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

CREATE POLICY "users: view self"
    ON public.users FOR SELECT
    USING (id = (SELECT auth.uid()));

CREATE POLICY "org_admins: invite users"
    ON public.users FOR INSERT
    WITH CHECK (
        (SELECT internal.is_org_admin())
        AND organization_id = (SELECT internal.current_organization_id())
    );

CREATE POLICY "platform_admins: create platform users"
    ON public.users FOR INSERT
    WITH CHECK ((SELECT internal.is_platform_admin()));

CREATE POLICY "org_admins: manage organization users"
    ON public.users FOR UPDATE
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()))
    WITH CHECK ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

CREATE POLICY "users: update own profile"
    ON public.users FOR UPDATE
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

-- ── devices ─────────────────────────────────────────────────────────────────
CREATE POLICY "devices: read own"
    ON public.devices FOR SELECT
    USING (id = (SELECT internal.current_device_id()));

CREATE POLICY "org_admins: manage organization devices"
    ON public.devices FOR ALL
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

CREATE POLICY "org_analysts: read assigned devices"
    ON public.devices FOR SELECT
    USING ((SELECT internal.user_has_device_access(id)));

CREATE POLICY "devices: update own"
    ON public.devices FOR UPDATE
    USING (id = (SELECT internal.current_device_id()))
    WITH CHECK (id = (SELECT internal.current_device_id()));

-- ── api_keys ────────────────────────────────────────────────────────────────
CREATE POLICY "org_admins: manage organization api keys"
    ON devices.api_keys FOR ALL
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

-- ── enrollment_tokens ──────────────────────────────────────────────────────
CREATE POLICY "org_admins: manage organization enrollment tokens"
    ON devices.enrollment_tokens FOR ALL
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

-- ── device_assignments ─────────────────────────────────────────────────────
CREATE POLICY "org_admins: manage organization assignments"
    ON public.device_assignments FOR ALL
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

CREATE POLICY "org_analysts: view own assignments"
    ON public.device_assignments FOR SELECT
    USING (user_id = (SELECT auth.uid()));

-- ── telemetry events ───────────────────────────────────────────────────────
CREATE POLICY "devices: insert own events"
    ON telemetry.events FOR INSERT
    WITH CHECK (device_id = (SELECT internal.current_device_id()));

CREATE POLICY "org_admins: read organization events"
    ON telemetry.events FOR SELECT
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

CREATE POLICY "org_analysts: read assigned device events"
    ON telemetry.events FOR SELECT
    USING ((SELECT internal.user_has_device_access(device_id)));

-- ── feature_vectors ────────────────────────────────────────────────────────
CREATE POLICY "devices: insert own feature vectors"
    ON telemetry.feature_vectors FOR INSERT
    WITH CHECK (device_id = (SELECT internal.current_device_id()));

CREATE POLICY "org_admins: read organization feature vectors"
    ON telemetry.feature_vectors FOR SELECT
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

CREATE POLICY "org_analysts: read assigned device feature vectors"
    ON telemetry.feature_vectors FOR SELECT
    USING ((SELECT internal.user_has_device_access(device_id)));

-- ── anomaly_scores ─────────────────────────────────────────────────────────
CREATE POLICY "devices: insert own anomaly scores"
    ON telemetry.anomaly_scores FOR INSERT
    WITH CHECK (device_id = (SELECT internal.current_device_id()));

CREATE POLICY "org_admins: read organization anomaly scores"
    ON telemetry.anomaly_scores FOR SELECT
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

CREATE POLICY "org_analysts: read assigned device anomaly scores"
    ON telemetry.anomaly_scores FOR SELECT
    USING ((SELECT internal.user_has_device_access(device_id)));

-- ── alerts ─────────────────────────────────────────────────────────────────
CREATE POLICY "devices: insert own alerts"
    ON public.alerts FOR INSERT
    WITH CHECK (device_id = (SELECT internal.current_device_id()));

CREATE POLICY "org_admins: manage organization alerts"
    ON public.alerts FOR ALL
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

CREATE POLICY "org_analysts: read assigned device alerts"
    ON public.alerts FOR SELECT
    USING ((SELECT internal.user_has_device_access(device_id)));

CREATE POLICY "org_analysts: update assigned device alerts"
    ON public.alerts FOR UPDATE
    USING ((SELECT internal.user_has_device_access(device_id)))
    WITH CHECK ((SELECT internal.user_has_device_access(device_id)));

-- ── device_health ──────────────────────────────────────────────────────────
CREATE POLICY "devices: insert own health"
    ON telemetry.device_health FOR INSERT
    WITH CHECK (device_id = (SELECT internal.current_device_id()));

CREATE POLICY "org_admins: read organization device health"
    ON telemetry.device_health FOR SELECT
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

CREATE POLICY "org_analysts: read assigned device health"
    ON telemetry.device_health FOR SELECT
    USING ((SELECT internal.user_has_device_access(device_id)));

-- ── sync_queue ─────────────────────────────────────────────────────────────
CREATE POLICY "devices: manage own sync queue"
    ON internal.sync_queue FOR ALL
    USING (device_id = (SELECT internal.current_device_id()));

CREATE POLICY "org_admins: read organization sync queue"
    ON internal.sync_queue FOR SELECT
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

-- ── retention_settings ─────────────────────────────────────────────────────
CREATE POLICY "org_admins: manage organization retention"
    ON public.retention_settings FOR ALL
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

-- ── privacy_settings ──────────────────────────────────────────────────────
CREATE POLICY "org_admins: manage organization privacy settings"
    ON public.privacy_settings FOR ALL
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

CREATE POLICY "org_analysts: read assigned device privacy settings"
    ON public.privacy_settings FOR SELECT
    USING ((SELECT internal.user_has_device_access(device_id)));

CREATE POLICY "org_analysts: update assigned device privacy settings"
    ON public.privacy_settings FOR UPDATE
    USING ((SELECT internal.user_has_device_access(device_id)))
    WITH CHECK ((SELECT internal.user_has_device_access(device_id)));

-- ── config ─────────────────────────────────────────────────────────────────
CREATE POLICY "devices: read own config"
    ON devices.config FOR SELECT
    USING (device_id = (SELECT internal.current_device_id()));

CREATE POLICY "org_admins: manage organization device config"
    ON devices.config FOR ALL
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

-- ── models ─────────────────────────────────────────────────────────────────
CREATE POLICY "org_admins: manage organization models"
    ON internal.models FOR ALL
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

CREATE POLICY "org_members: read organization models"
    ON internal.models FOR SELECT
    USING (organization_id = (SELECT internal.current_organization_id()));

CREATE POLICY "platform_admins: manage all models"
    ON internal.models FOR ALL
    USING ((SELECT internal.is_platform_admin()));

-- ── notifications ──────────────────────────────────────────────────────────
CREATE POLICY "users: manage own notifications"
    ON public.notifications FOR ALL
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY "org_admins: read organization notifications"
    ON public.notifications FOR SELECT
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

-- ── audit_logs ─────────────────────────────────────────────────────────────
-- NOTE: INSERT uses WITH CHECK (FALSE) intentionally — only service_role
-- (which bypasses RLS) can write. authenticated users insert via edge functions.
CREATE POLICY "service: insert audit logs"
    ON internal.audit_logs FOR INSERT
    WITH CHECK (FALSE);

CREATE POLICY "org_admins: read organization audit logs"
    ON internal.audit_logs FOR SELECT
    USING ((SELECT internal.is_org_admin()) AND organization_id = (SELECT internal.current_organization_id()));

CREATE POLICY "platform_admins: read all audit logs"
    ON internal.audit_logs FOR SELECT
    USING ((SELECT internal.is_platform_admin()));

-- ─── Grants ───────────────────────────────────────────────────────────────────

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

GRANT SELECT, INSERT, UPDATE          ON public.users                  TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON public.devices                TO authenticated;
GRANT SELECT, INSERT                  ON telemetry.events              TO authenticated;
GRANT SELECT                          ON telemetry.feature_vectors     TO authenticated;
GRANT SELECT                          ON telemetry.anomaly_scores      TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON public.alerts                 TO authenticated;
GRANT SELECT                          ON telemetry.device_health       TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON public.device_assignments     TO authenticated;
GRANT SELECT                          ON internal.audit_logs           TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON public.privacy_settings       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON internal.sync_queue           TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON public.retention_settings     TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON public.notifications          TO authenticated;
GRANT SELECT                          ON internal.models               TO authenticated;
GRANT SELECT                          ON organization.organizations    TO authenticated;
GRANT SELECT                          ON organization.billing          TO authenticated;

REVOKE ALL ON devices.api_keys        FROM authenticated;
REVOKE ALL ON devices.config          FROM authenticated;

GRANT ALL ON ALL TABLES    IN SCHEMA public       TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA devices      TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA telemetry    TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA internal     TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA organization TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public       TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA devices      TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA telemetry    TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA internal     TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA organization TO service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public       TO service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA internal   TO service_role;

GRANT SELECT ON internal.platform_device_summary  TO authenticated;
GRANT SELECT ON internal.platform_user_summary    TO authenticated;
GRANT SELECT ON internal.platform_event_volume    TO authenticated;

GRANT EXECUTE ON FUNCTION public.validate_enrollment_token(TEXT) TO anon, authenticated;

-- ─── Function permission hardening ────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.set_updated_at()               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION internal.sync_organization_to_jwt() FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION internal.current_organization_id()                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION internal.is_platform_admin()                      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION internal.is_org_admin()                           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION internal.is_authenticated_device()                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION internal.user_has_device_access(UUID)             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION internal.get_user_assigned_devices()              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION internal.current_device_id()                      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION internal.get_device_id_from_headers()             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION internal.get_api_key_from_headers()               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION internal.validate_enrollment_token(TEXT)          FROM PUBLIC;

GRANT EXECUTE ON FUNCTION internal.current_organization_id()                 TO authenticated;
GRANT EXECUTE ON FUNCTION internal.is_platform_admin()                       TO authenticated;
GRANT EXECUTE ON FUNCTION internal.is_org_admin()                            TO authenticated;
GRANT EXECUTE ON FUNCTION internal.is_authenticated_device()                 TO authenticated;
GRANT EXECUTE ON FUNCTION internal.user_has_device_access(UUID)              TO authenticated;
GRANT EXECUTE ON FUNCTION internal.get_user_assigned_devices()               TO authenticated;
GRANT EXECUTE ON FUNCTION internal.current_device_id()                       TO authenticated;
GRANT EXECUTE ON FUNCTION internal.get_device_id_from_headers()             TO authenticated, anon;
GRANT EXECUTE ON FUNCTION internal.get_api_key_from_headers()               TO authenticated, anon;
GRANT EXECUTE ON FUNCTION internal.validate_enrollment_token(TEXT)          TO authenticated;

-- ─── Realtime publications ────────────────────────────────────────────────────
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE internal.sync_queue;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE telemetry.events;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;
