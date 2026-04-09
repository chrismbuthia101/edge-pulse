-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 011_fix_views_and_schema_issues
-- Description: Fix views that reference auth.users directly (breaks RLS),
--              and correct any remaining schema mismatches.
-- ============================================================

-- ─── 1. Fix pending_users view ────────────────────────────────────────────────
-- The original view joins auth.users which is not accessible via the JS client
-- under RLS. We expose only what's in analyst_users (which IS accessible to admins)
-- and drop the auth.users join. Email can be retrieved separately via admin API.

DROP VIEW IF EXISTS pending_users;

CREATE VIEW pending_users AS
SELECT
    au.user_id,
    au.full_name,
    au.department,
    au.created_at,
    au.approval_status,
    au.role,
    au.is_active
FROM analyst_users au
WHERE au.approval_status = 'PENDING'
  AND au.is_active        = TRUE
  AND au.role             = 'ANALYST';

-- Grant select on the fixed view
GRANT SELECT ON pending_users TO authenticated;

-- ─── 2. Fix device_assignment_details view ────────────────────────────────────
-- Same issue: joining auth.users is not accessible. Remove that join.

DROP VIEW IF EXISTS device_assignment_details;

CREATE VIEW device_assignment_details AS
SELECT
    ada.assignment_id,
    ada.analyst_id,
    ada.device_id,
    ada.assigned_at,
    ada.assigned_by,
    ada.is_active,
    au.full_name    AS analyst_name,
    dr.name         AS device_name,
    dr.type         AS device_type,
    dr.status       AS device_status,
    dr.ip           AS device_ip
FROM analyst_device_assignments ada
JOIN analyst_users   au   ON ada.analyst_id = au.user_id
JOIN device_registry dr   ON ada.device_id  = dr.id
WHERE ada.is_active = TRUE;

-- Grant select on the fixed view
GRANT SELECT ON device_assignment_details TO authenticated;

-- ─── 3. Ensure device_registry columns match code expectations ────────────────
-- Migration 001 already defines: name, type (device_type), os, ip, agent_version,
-- status, risk, enrolled_by, last_seen, is_active — these are correct.
-- The old enroll-device function used hostname/operating_system/last_seen_utc
-- which do NOT exist. The edge function has been fixed separately.
-- No column changes needed here.

-- ─── 4. Fix get_user_assigned_devices function return type ───────────────────
-- The function returns type::TEXT and status::TEXT but device_type and device_status
-- are enums. Explicit casts prevent type mismatch errors.

CREATE OR REPLACE FUNCTION get_user_assigned_devices()
RETURNS TABLE(device_id UUID, device_name TEXT, device_type TEXT, device_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dr.id,
        dr.name,
        dr.type::TEXT,
        dr.status::TEXT
    FROM public.device_registry dr
    JOIN public.analyst_device_assignments ada ON dr.id = ada.device_id
    WHERE ada.analyst_id = auth.uid()
      AND ada.is_active  = TRUE
      AND dr.is_active   = TRUE;
END;
$$;

-- ─── 5. Add RLS policy so authenticated users can read the fixed views ────────
-- Views inherit RLS from their base tables, so no additional policies needed.
-- The grants above are sufficient.