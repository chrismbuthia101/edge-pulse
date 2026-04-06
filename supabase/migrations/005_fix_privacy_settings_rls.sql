-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 005_fix_privacy_settings_rls
-- Description: Fix privacy_settings RLS policy to allow users to manage their own settings
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "devices: read own privacy settings" ON privacy_settings;
DROP POLICY IF EXISTS "analysts: read assigned privacy settings" ON privacy_settings;
DROP POLICY IF EXISTS "admins: manage privacy settings" ON privacy_settings;

-- Create new policies that allow users to manage their own privacy settings
CREATE POLICY "users: read privacy settings" ON privacy_settings FOR SELECT 
    USING (
        device_id IS NULL OR 
        device_id = current_device_id() OR 
        (is_analyst_or_admin() AND analyst_has_device_access(device_id))
    );

CREATE POLICY "users: insert privacy settings" ON privacy_settings FOR INSERT 
    WITH CHECK (
        device_id IS NULL OR 
        device_id = current_device_id() OR 
        (is_analyst_or_admin() AND analyst_has_device_access(device_id))
    );

CREATE POLICY "users: update privacy settings" ON privacy_settings FOR UPDATE 
    USING (
        device_id IS NULL OR 
        device_id = current_device_id() OR 
        (is_analyst_or_admin() AND analyst_has_device_access(device_id))
    )
    WITH CHECK (
        device_id IS NULL OR 
        device_id = current_device_id() OR 
        (is_analyst_or_admin() AND analyst_has_device_access(device_id))
    );
