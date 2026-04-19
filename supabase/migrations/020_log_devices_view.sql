-- ============================================================
-- EdgePulse Schema
-- Migration: 020_log_devices_view
-- Description: Create a view for log device summary with names
-- ============================================================

-- Drop existing view if present
DROP VIEW IF EXISTS log_device_summary;

-- Create view that aggregates log data per device with device names
CREATE VIEW log_device_summary AS
SELECT 
    dr.id AS device_id,
    dr.name AS device_name,
    COALESCE(latest_log.log_count, 0) AS log_count,
    COALESCE(latest_log.last_log_sequence, 0) AS last_log_sequence,
    latest_log.last_entry_timestamp
FROM device_registry dr
LEFT JOIN (
    SELECT 
        device_id,
        COUNT(*) AS log_count,
        MAX(log_sequence_number) AS last_log_sequence,
        MAX(entry_timestamp_utc) AS last_entry_timestamp
    FROM tamper_evident_log
    GROUP BY device_id
) latest_log ON dr.id = latest_log.device_id;

-- Grant permissions
GRANT SELECT ON log_device_summary TO authenticated;
GRANT SELECT ON log_device_summary TO anon;

-- Create RLS policy for the view (uses underlying table policies)
ALTER VIEW log_device_summary SET (security_invoker = on);
