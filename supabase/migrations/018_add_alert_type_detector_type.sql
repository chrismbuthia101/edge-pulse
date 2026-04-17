-- Add alert_type and detector_type columns to alert_records table
-- These fields are sent by the agent but were missing from the schema

ALTER TABLE alert_records
ADD COLUMN IF NOT EXISTS alert_type TEXT DEFAULT 'behavioral_deviation',
ADD COLUMN IF NOT EXISTS detector_type TEXT DEFAULT 'unknown';

-- Add comments for documentation
COMMENT ON COLUMN alert_records.alert_type IS 'Type of alert (e.g., behavioral_deviation, network_anomaly)';
COMMENT ON COLUMN alert_records.detector_type IS 'Type of detector that generated the alert (e.g., IsolationForestDetector)';

-- Create index on alert_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_ar_alert_type ON alert_records(alert_id, alert_type);
