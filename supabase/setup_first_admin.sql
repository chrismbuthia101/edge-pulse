-- ============================================================
-- EdgePulse Initial Administrator Setup
-- Description: Bootstrap the first administrator for the system
-- Usage: Run this script manually after initial deployment
-- ============================================================

-- Replace 'admin@example.com' with the actual admin email address

DO $$
DECLARE
    admin_user_id UUID;
    admin_email TEXT := 'christofmbuthia.mg2018@gmail.com';  -- CHANGE THIS EMAIL
    existing_admin_count INTEGER;
BEGIN
    -- Check if any administrators already exist
    SELECT COUNT(*) INTO existing_admin_count
    FROM analyst_users 
    WHERE role = 'ADMINISTRATOR' AND approval_status = 'APPROVED' AND is_active = TRUE;
    
    IF existing_admin_count > 0 THEN
        RAISE NOTICE 'Administrators already exist (% found). Skipping bootstrap setup.', existing_admin_count;
        RETURN;
    END IF;
    
    -- Find the user by email
    SELECT id INTO admin_user_id 
    FROM auth.users 
    WHERE email = admin_email;
    
    IF admin_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found. Please ensure the user has registered first.', admin_email;
    END IF;
    
    -- Check if user exists in analyst_users table
    IF NOT EXISTS (SELECT 1 FROM analyst_users WHERE user_id = admin_user_id) THEN
        -- Create the analyst_users record if it doesn't exist
        INSERT INTO analyst_users (user_id, full_name, role, approval_status, is_active)
        SELECT 
            id,
            COALESCE(raw_user_meta_data->>'full_name', email),
            'ADMINISTRATOR',
            'APPROVED',
            TRUE
        FROM auth.users 
        WHERE id = admin_user_id;
        
        RAISE NOTICE 'Created analyst_users record for user: %', admin_email;
    END IF;
    
    -- Update the user to be an administrator (bypassing normal approval workflow)
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
    
    RAISE NOTICE 'Administrator bootstrap completed for email: %', admin_email;
    RAISE NOTICE 'User ID: %', admin_user_id;
    RAISE NOTICE 'This user can now log in and approve other administrators.';
END $$;

-- Verify the setup
SELECT 
    au.user_id,
    au.full_name,
    au.role,
    au.approval_status,
    au.is_active,
    au.approved_at,
    auth.email,
    auth.created_at as auth_created_at
FROM analyst_users au
JOIN auth.users auth ON au.user_id = auth.id
WHERE au.role = 'ADMINISTRATOR'
ORDER BY au.created_at;

-- Check for any pending users that might need approval
SELECT 
    au.user_id,
    au.full_name,
    au.role,
    au.approval_status,
    au.is_active,
    auth.email,
    au.created_at
FROM analyst_users au
JOIN auth.users auth ON au.user_id = auth.id
WHERE au.approval_status = 'PENDING' AND au.is_active = TRUE
ORDER BY au.created_at;

-- ============================================================
-- Instructions for use:
-- 1. Replace 'admin@example.com' with your actual admin email
-- 2. Ensure the admin user has already registered through the signup form
-- 3. Run this script in the Supabase SQL editor
-- 4. Verify the user appears as an active, approved administrator above
-- 5. The admin can now log in and approve other users
-- 
-- Important: This script is designed to run only once and will skip
-- execution if administrators already exist to prevent accidental overrides.
-- ============================================================
