-- Fix trigger functions to bypass RLS when syncing case alert metadata
-- These functions need SECURITY DEFINER to update case_alerts without being blocked by RLS

-- ── sync_case_alert_metadata ─────────────────────────────────────────────────────
-- This function updates case_alerts when alert_records changes
-- It needs SECURITY DEFINER to bypass RLS on case_alerts table
CREATE OR REPLACE FUNCTION sync_case_alert_metadata()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
    UPDATE case_alerts
    SET    alert_severity    = NEW.severity,
           alert_status      = NEW.status,
           explanation_json  = NEW.explanation_json
    WHERE  alert_id = NEW.alert_id;
    RETURN NEW;
END;
$$;

-- ── sync_case_alert_count ───────────────────────────────────────────────────────
-- This function queries case_alerts to update incident_cases.alert_count
-- It needs SECURITY DEFINER to bypass RLS on case_alerts table
CREATE OR REPLACE FUNCTION sync_case_alert_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_case_id UUID;
BEGIN
    v_case_id := COALESCE(NEW.case_id, OLD.case_id);
    UPDATE incident_cases
    SET    alert_count   = (SELECT COUNT(*) FROM case_alerts WHERE case_id = v_case_id),
           last_activity = NOW(),
           updated_at    = NOW()
    WHERE  id = v_case_id;
    RETURN COALESCE(NEW, OLD);
END;
$$;
