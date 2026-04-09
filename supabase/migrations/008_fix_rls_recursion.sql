-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 008_fix_rls_recursion
-- Description: Fix infinite recursion in RLS policies by updating helper functions
-- ============================================================

-- Drop existing helper functions that cause recursion
DROP FUNCTION IF EXISTS is_admin() CASCADE;
DROP FUNCTION IF EXISTS is_analyst_or_admin() CASCADE;
DROP FUNCTION IF EXISTS get_device_id_from_headers() CASCADE;
DROP FUNCTION IF EXISTS get_api_key_from_headers() CASCADE;
DROP FUNCTION IF EXISTS is_authenticated_device() CASCADE;
DROP FUNCTION IF EXISTS current_device_id() CASCADE;
DROP FUNCTION IF EXISTS analyst_has_device_access(UUID) CASCADE;

-- Recreate helper functions with pg_catalog search path to bypass RLS
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (
        SELECT 1 FROM analyst_users
        WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR' AND is_active = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION is_analyst_or_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (
        SELECT 1 FROM analyst_users
        WHERE user_id = auth.uid() AND role IN ('ANALYST','ADMINISTRATOR') AND is_active = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION get_device_id_from_headers()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
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
SET search_path = pg_catalog, public AS $$
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
SET search_path = pg_catalog, public AS $$
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
SET search_path = pg_catalog, public AS $$
BEGIN
    IF is_authenticated_device() THEN RETURN get_device_id_from_headers(); END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION analyst_has_device_access(p_device_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
    SELECT is_admin()
        OR EXISTS (
            SELECT 1 FROM analyst_device_assignments
            WHERE analyst_id = auth.uid()
              AND device_id  = p_device_id
              AND is_active  = TRUE
        );
$$;
