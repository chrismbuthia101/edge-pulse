-- ============================================================
-- EdgePulse Schema Migration 015
-- Migration: 015_add_token_name
-- Description: Add name column to device_enrollment_tokens table
-- ============================================================

-- Add name column to device_enrollment_tokens for labeling tokens
ALTER TABLE device_enrollment_tokens
ADD COLUMN IF NOT EXISTS name TEXT;

COMMENT ON COLUMN device_enrollment_tokens.name IS 'Human-readable label for the enrollment token (e.g., "Office Laptops", "Test Devices")';
