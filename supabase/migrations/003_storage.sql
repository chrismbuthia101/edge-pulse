-- ============================================================
-- EdgePulse Schema v3.1.0 — Multi-Tenant
-- Migration: 003_storage
-- Description: Storage buckets & RLS policies for object storage
-- ============================================================

-- ─── Organization Logo Storage ───────────────────────────────────────────────
INSERT INTO
    storage.buckets (
        id,
        name,
        public,
        file_size_limit,
        allowed_mime_types
    )
VALUES (
        'org-logos',
        'org-logos',
        true,
        2097152,
        ARRAY ['image/png', 'image/jpeg']
    )
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "org_admins: manage org logos"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'org-logos'
    AND auth.role() = 'authenticated'
    AND (SELECT internal.is_org_admin())
    AND ((SELECT internal.current_organization_id()::text) = (storage.foldername(name))[1])
  );

-- ─── User Avatar Storage ─────────────────────────────────────────────────────
INSERT INTO
    storage.buckets (
        id,
        name,
        public,
        file_size_limit,
        allowed_mime_types
    )
VALUES (
        'avatars',
        'avatars',
        true,
        2097152,
        ARRAY ['image/png', 'image/jpeg']
    )
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "authenticated: read avatars" ON storage.objects FOR
SELECT USING (
        bucket_id = 'avatars'
        AND auth.role () = 'authenticated'
    );

CREATE POLICY "users: insert own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "users: update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "users: delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );