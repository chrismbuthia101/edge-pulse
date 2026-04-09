-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 003_auto_provision_analyst  (consolidated — includes all fixes)
-- Description: Auto-create analyst_users row on Supabase Auth signup
-- ============================================================

-- Auto-provision function — creates an analyst_users row for every
-- new Supabase Auth signup.  Users start as PENDING and must be
-- approved by an ADMINISTRATOR before they can access the platform.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO analyst_users (user_id, full_name, role, approval_status)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        'ANALYST',
        'PENDING'
    )
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- Drop any pre-existing version of the trigger before recreating it
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();