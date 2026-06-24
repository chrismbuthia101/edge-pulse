-- ============================================================
-- EdgePulse Schema v3.1.0 — Platform Administrator Bootstrap
-- Description: Bootstrap the first platform administrator.
--   Platform admins oversee the entire infrastructure and are
--   not associated with any single organization.
-- Usage: Run this script manually after initial deployment
-- ============================================================

-- Replace with the actual admin email address
DO $$
DECLARE
    admin_user_id UUID;
    admin_email TEXT := 'admin@example.com';
    existing_admin_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO existing_admin_count
    FROM organization.profiles
    WHERE role = 'PLATFORM_ADMIN'::user_role 
      AND account_status = 'ACTIVE'::account_status
      AND organization_id IS NULL;

    IF existing_admin_count > 0 THEN
        RAISE NOTICE 'Platform administrators already exist (%). Skipping bootstrap.', existing_admin_count;
        RETURN;
    END IF;

    SELECT id INTO admin_user_id
    FROM auth.users
    WHERE email = admin_email;

    IF admin_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found. Ensure they have registered first.', admin_email;
    END IF;

    -- Platform admin has no organization_id — they oversee all orgs.
    INSERT INTO public.users (id, full_name)
    SELECT
        admin_user_id,
        COALESCE(raw_user_meta_data->>'full_name', email)
    FROM auth.users
    WHERE id = admin_user_id
    ON CONFLICT (id) DO NOTHING;

    UPDATE organization.profiles
    SET role = 'PLATFORM_ADMIN'::user_role,
        account_status = 'ACTIVE'::account_status
    WHERE user_id = admin_user_id
      AND organization_id IS NULL;

    IF NOT FOUND THEN
        INSERT INTO organization.profiles (user_id, organization_id, role, account_status)
        VALUES (admin_user_id, NULL, 'PLATFORM_ADMIN'::user_role, 'ACTIVE'::account_status);
    END IF;

    RAISE NOTICE 'Administrator bootstrap completed for email: %', admin_email;
    RAISE NOTICE 'User ID: %', admin_user_id;
END $$;

-- Verify the setup
SELECT
    u.id,
    u.full_name,
    p.role::TEXT,
    p.account_status::TEXT,
    p.organization_id
FROM public.users u
JOIN organization.profiles p ON p.user_id = u.id
WHERE p.role = 'PLATFORM_ADMIN' AND p.organization_id IS NULL
ORDER BY u.created_at;