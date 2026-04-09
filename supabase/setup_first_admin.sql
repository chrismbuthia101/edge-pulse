-- ============================================================
-- EdgePulse Initial Administrator Setup
-- Description: Set up the first administrator for the system
-- Usage: Run this script manually after initial deployment
-- ============================================================

-- Replace 'admin@example.com' with the actual admin email address
-- This script should be run once to set up the first administrator

DO $$
DECLARE
    admin_user_id UUID;
    admin_email TEXT := 'christofmbuthia.mg2018@gmail.com';  -- CHANGE THIS EMAIL
BEGIN
    -- Find the user by email
    SELECT id INTO admin_user_id 
    FROM auth.users 
    WHERE email = admin_email;
    
    IF admin_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found. Please ensure the user has registered first.', admin_email;
    END IF;
    
    -- Update the user to be an administrator
    UPDATE analyst_users 
    SET 
        role = 'ADMINISTRATOR',
        approval_status = 'APPROVED',
        approved_by = admin_user_id,  -- Self-approved for first admin
        approved_at = NOW(),
        is_active = TRUE,
        updated_at = NOW()
    WHERE user_id = admin_user_id;
    
    -- Verify the update
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Failed to update user. Check if user exists in analyst_users table.';
    END IF;
    
    RAISE NOTICE 'Administrator setup completed for email: %', admin_email;
    RAISE NOTICE 'User ID: %', admin_user_id;
END $$;

-- Verify the setup
SELECT 
    au.user_id,
    au.full_name,
    au.role,
    au.approval_status,
    au.is_active,
    auth.email
FROM analyst_users au
JOIN auth.users auth ON au.user_id = auth.id
WHERE au.role = 'ADMINISTRATOR';

-- Instructions for use:
-- 1. Replace 'admin@example.com' with your actual admin email
-- 2. Ensure the admin user has already registered through the signup form
-- 3. Run this script in the Supabase SQL editor
-- 4. Verify the user appears as an active, approved administrator
-- 5. The admin can now log in and approve other users
