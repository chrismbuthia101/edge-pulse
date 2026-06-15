-- ============================================================
-- EdgePulse Initial Administrator Setup
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
    FROM public.users
    WHERE role = 'PLATFORM_ADMIN' AND account_status = 'ACTIVE';

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
    INSERT INTO public.users (id, full_name, role, account_status, organization_id)
    SELECT
        admin_user_id,
        COALESCE(raw_user_meta_data->>'full_name', email),
        'PLATFORM_ADMIN',
        'ACTIVE',
        NULL
    FROM auth.users
    WHERE id = admin_user_id
    ON CONFLICT (id) DO UPDATE
        SET role = 'PLATFORM_ADMIN',
            account_status = 'ACTIVE',
            organization_id = NULL;

    RAISE NOTICE 'Administrator bootstrap completed for email: %', admin_email;
    RAISE NOTICE 'User ID: %', admin_user_id;
END $$;

-- Verify the setup
SELECT
    u.id,
    u.full_name,
    u.role::TEXT,
    u.account_status::TEXT,
    u.organization_id
FROM public.users u
WHERE u.role = 'PLATFORM_ADMIN'
ORDER BY u.created_at;
