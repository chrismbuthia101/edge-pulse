-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 004_fix_device_assignment_view
-- Description: Fix device assignment view permissions and add analyst details view
-- ============================================================

-- Create a secure view for analyst details that includes email from auth.users
-- This view uses SECURITY DEFINER to bypass RLS and properly access auth.users
CREATE OR REPLACE VIEW analyst_details AS
SELECT 
    au.user_id,
    au.full_name,
    auth.email,
    au.department,
    au.role,
    au.is_active,
    au.approval_status,
    au.created_at
FROM analyst_users au
JOIN auth.users auth ON au.user_id = auth.id;

-- Grant proper permissions to the analyst_details view
GRANT SELECT ON analyst_details TO authenticated;
GRANT SELECT ON analyst_details TO anon;

-- Update the device_assignment_details view to use a more secure approach
-- Create a function that can access auth.users with proper permissions
CREATE OR REPLACE FUNCTION get_device_assignment_details()
RETURNS TABLE (
    assignment_id UUID,
    analyst_id UUID,
    device_id UUID,
    assigned_at TIMESTAMPTZ,
    assigned_by UUID,
    is_active BOOLEAN,
    analyst_name TEXT,
    analyst_email TEXT,
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

-- Create a new secure view using the function
DROP VIEW IF EXISTS device_assignment_details_secure;
CREATE VIEW device_assignment_details_secure AS
SELECT * FROM get_device_assignment_details();

-- Grant permissions to the new view
GRANT SELECT ON device_assignment_details_secure TO authenticated;
GRANT SELECT ON device_assignment_details_secure TO anon;

-- Update existing RLS policies to ensure analysts can access their own assignments
DROP POLICY IF EXISTS "analysts: view own assignments" ON analyst_device_assignments;
CREATE POLICY "analysts: view own assignments"
    ON analyst_device_assignments FOR SELECT
    USING (auth.uid() = analyst_id);

-- Ensure admins can view all assignments
DROP POLICY IF EXISTS "admins: view all assignments" ON analyst_device_assignments;
CREATE POLICY "admins: view all assignments"
    ON analyst_device_assignments FOR SELECT
    USING (is_admin());
