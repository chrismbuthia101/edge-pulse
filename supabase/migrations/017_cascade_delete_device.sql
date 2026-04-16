-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 016_cascade_delete_device
-- Description: Add CASCADE delete for device_id foreign keys
-- ============================================================

-- Fix audit_trail foreign key to cascade delete when device is deleted
ALTER TABLE audit_trail DROP CONSTRAINT IF EXISTS audit_trail_device_id_fkey;

ALTER TABLE audit_trail
    ADD CONSTRAINT audit_trail_device_id_fkey
    FOREIGN KEY (device_id)
    REFERENCES device_registry(id)
    ON DELETE CASCADE;