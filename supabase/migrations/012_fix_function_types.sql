-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 012_fix_function_types
-- Description: Fix type mismatch in get_device_assignment_details function
-- ============================================================

-- Drop the view first (it depends on the function)
DROP VIEW IF EXISTS device_assignment_details_secure;

-- Now drop and recreate the function with correct types
DROP FUNCTION IF EXISTS get_device_assignment_details();

CREATE OR REPLACE FUNCTION get_device_assignment_details()
RETURNS TABLE (
    assignment_id UUID,
    analyst_id UUID,
    device_id UUID,
    assigned_at TIMESTAMPTZ,
    assigned_by UUID,
    is_active BOOLEAN,
    analyst_name TEXT,
    analyst_email VARCHAR(255),  -- Changed from TEXT to VARCHAR(255) to match auth.users.email
    device_name TEXT,
    device_type device_type,
    device_status device_status,
    device_ip INET
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ada.assignment_id,
        ada.analyst_id,
        ada.device_id,
        ada.assigned_at,
        ada.assigned_by,
        ada.is_active,
        au.full_name AS analyst_name,
        auth.email AS analyst_email,
        dr.name AS device_name,
        dr.type AS device_type,
        dr.status AS device_status,
        dr.ip AS device_ip
    FROM analyst_device_assignments ada
    JOIN analyst_users au ON ada.analyst_id = au.user_id
    JOIN auth.users auth ON au.user_id = auth.id
    JOIN device_registry dr ON ada.device_id = dr.id
    WHERE ada.is_active = TRUE;
END;
$$;

-- Recreate the view to use the updated function
CREATE VIEW device_assignment_details_secure AS
SELECT * FROM get_device_assignment_details();

-- Grant permissions to the view
GRANT SELECT ON device_assignment_details_secure TO authenticated;
GRANT SELECT ON device_assignment_details_secure TO anon;
