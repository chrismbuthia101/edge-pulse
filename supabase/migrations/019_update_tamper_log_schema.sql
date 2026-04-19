-- Migration: 019_update_tamper_log_schema
-- Description: Update tamper_evident_log to support agent event types and fix reference_id type

-- Update the check constraint to allow agent event types
ALTER TABLE tamper_evident_log DROP CONSTRAINT IF EXISTS tamper_evident_log_log_entry_type_check;

ALTER TABLE tamper_evident_log
ADD CONSTRAINT tamper_evident_log_log_entry_type_check
CHECK (log_entry_type IN ('TELEMETRY','ALERT','DETECTION','SYNC','SYSTEM','AGENT','ANOMALY','ALERT_EVENT','HEALTH'));

-- Change log_entry_reference_id from UUID to TEXT for flexibility
ALTER TABLE tamper_evident_log ALTER COLUMN log_entry_reference_id TYPE TEXT;

-- Add index for better query performance on entry types
CREATE INDEX IF NOT EXISTS idx_tel_entry_type ON tamper_evident_log(log_entry_type);
