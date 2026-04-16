-- Migration: Fix device INSERT permissions for alert_records and telemetry_events
-- Created: 2026-04-16
-- 
-- Issue: Authenticated devices with valid API keys cannot insert alerts or telemetry
-- due to missing INSERT grants on these tables. This causes 401 errors during sync.
--
-- Root cause: RLS policy allows inserts (devices: insert own alerts), but table-level
-- permissions for the 'authenticated' role were missing INSERT.

-- Fix alert_records INSERT permission for authenticated devices
GRANT INSERT ON alert_records TO authenticated;
-- Fix telemetry_events INSERT permission for authenticated devices
GRANT INSERT ON telemetry_events TO authenticated;
-- Note: After applying this migration, restart the edgepulse-agent service:
--   sudo systemctl restart edgepulse-agent;