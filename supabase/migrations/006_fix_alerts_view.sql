-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 006_fix_alerts_view
-- Description: Fix alerts view to prevent column conflicts
-- ============================================================

-- Drop and recreate the alerts view with explicit column selection
-- This prevents "telemetry_events.alert_id does not exist" errors
-- by avoiding wildcard SELECT * which can cause column conflicts

DROP VIEW IF EXISTS alerts;

CREATE VIEW alerts AS
    SELECT 
        alert_id AS id,
        device_id,
        device_name,
        telemetry_event_id,
        feature_vector_id,
        anomaly_score_id,
        anomaly_score,
        model_id,
        collection_agent_version,
        inference_latency_ms,
        telemetry_source,
        title,
        description,
        severity,
        category,
        confidence,
        detection_window_start,
        detection_window_end,
        detection_window_minutes,
        explanation_json,
        net_destination_ip,
        net_destination_port,
        net_protocol,
        net_duration_ms,
        proc_name,
        proc_privilege_level,
        proc_pid,
        status,
        read,
        created_at,
        updated_at,
        acknowledged_at,
        acknowledged_by,
        investigated_at,
        investigated_by,
        closed_at,
        closed_by
    FROM alert_records;
