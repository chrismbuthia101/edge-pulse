-- EdgePulse Complete Database Schema
-- Aligns with checklist requirements

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums for data consistency
CREATE TYPE alert_severity_enum AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE alert_status_enum AS ENUM ('PENDING', 'ACKNOWLEDGED', 'INVESTIGATED', 'CLOSED');
CREATE TYPE event_type_enum AS ENUM ('PROCESS', 'NETWORK', 'FILE', 'RESOURCE');
CREATE TYPE sync_status_enum AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE device_status_enum AS ENUM ('ONLINE', 'OFFLINE', 'WARNING', 'ERROR');

-- 1. analyst_users - Human authentication and roles
CREATE TABLE analyst_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ANALYST', 'ADMINISTRATOR')) DEFAULT 'ANALYST',
    department TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. device_registry - Device enrollment and management
CREATE TABLE device_registry (
    device_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hostname TEXT NOT NULL,
    operating_system TEXT NOT NULL,
    agent_version TEXT NOT NULL,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    enrolled_by UUID REFERENCES analyst_users(user_id),
    last_seen_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. agent_api_keys - Device authentication keys
CREATE TABLE agent_api_keys (
    key_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES device_registry(device_id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL UNIQUE, -- bcrypt hash of the API key
    key_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    last_used_ip INET,
    created_by UUID REFERENCES analyst_users(user_id),
    
    CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- 4. device_enrollment_tokens - One-time enrollment tokens
CREATE TABLE device_enrollment_tokens (
    token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of the actual token
    created_by UUID NOT NULL REFERENCES analyst_users(user_id),
    expires_at TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    used_by_device_id UUID REFERENCES device_registry(device_id),
    max_uses INTEGER NOT NULL DEFAULT 1,
    current_uses INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CHECK (current_uses <= max_uses),
    CHECK (expires_at > created_at)
);

-- 5. agent_config - Device configuration management
CREATE TABLE agent_config (
    config_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES device_registry(device_id) ON DELETE CASCADE, -- NULL for global config
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_by UUID REFERENCES analyst_users(user_id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    UNIQUE(device_id, key)
);

-- 6. telemetry_events - Canonical telemetry storage
CREATE TABLE telemetry_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES device_registry(device_id) ON DELETE CASCADE,
    timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL CHECK (event_type IN ('PROCESS', 'NETWORK', 'FILE', 'RESOURCE')),
    event_payload JSONB NOT NULL,
    collection_agent_version TEXT NOT NULL,
    payload_hash TEXT NOT NULL, -- SHA-256 hash of event_payload
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    INDEX idx_telemetry_device_timestamp (device_id, timestamp_utc),
    INDEX idx_telemetry_event_type (event_type),
    INDEX idx_telemetry_payload_hash (payload_hash)
);

-- 7. feature_vectors - ML feature storage
CREATE TABLE feature_vectors (
    feature_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES device_registry(device_id) ON DELETE CASCADE,
    window_start_utc TIMESTAMPTZ NOT NULL,
    window_end_utc TIMESTAMPTZ NOT NULL,
    feature_vector BYTEA NOT NULL, -- Float32 array as BLOB
    feature_schema_version TEXT NOT NULL DEFAULT 'v1.0',
    source_event_ids UUID[] NOT NULL, -- Array of telemetry event IDs
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    INDEX idx_features_device_window (device_id, window_start_utc, window_end_utc),
    INDEX idx_features_schema_version (feature_schema_version)
);

-- 8. anomaly_scores - ML anomaly detection results
CREATE TABLE anomaly_scores (
    score_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feature_id UUID NOT NULL REFERENCES feature_vectors(feature_id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES device_registry(device_id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    anomaly_score DECIMAL(10,8) NOT NULL,
    detection_threshold_applied DECIMAL(10,8) NOT NULL,
    is_alert_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    inference_latency_ms INTEGER NOT NULL,
    scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    INDEX idx_anomaly_feature (feature_id),
    INDEX idx_anomaly_device_score (device_id, anomaly_score),
    INDEX idx_anomaly_triggered (is_alert_triggered, scored_at)
);

-- 9. alert_records - Alert management with explanations
CREATE TABLE alert_records (
    alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    score_id UUID NOT NULL REFERENCES anomaly_scores(score_id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES device_registry(device_id) ON DELETE CASCADE,
    alert_severity TEXT NOT NULL CHECK (alert_severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    alert_status TEXT NOT NULL CHECK (alert_status IN ('PENDING', 'ACKNOWLEDGED', 'INVESTIGATED', 'CLOSED')) DEFAULT 'PENDING',
    explanation_json JSONB NOT NULL, -- SHAP/LIME explanation (NOT NULL per checklist)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Alert metadata
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES analyst_users(user_id),
    investigated_at TIMESTAMPTZ,
    investigated_by UUID REFERENCES analyst_users(user_id),
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES analyst_users(user_id),
    
    INDEX idx_alerts_device_severity (device_id, alert_severity),
    INDEX idx_alerts_status (alert_status),
    INDEX idx_alerts_created (created_at DESC)
);

-- 10. tamper_evident_log - Integrity verification log
CREATE TABLE tamper_evident_log (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    log_sequence_number BIGINT NOT NULL,
    device_id UUID NOT NULL REFERENCES device_registry(device_id) ON DELETE CASCADE,
    log_entry_type TEXT NOT NULL,
    log_entry_reference_id UUID, -- Reference to the actual record
    entry_timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    entry_content_hash TEXT NOT NULL, -- Hash of referenced record content
    previous_entry_hash TEXT NOT NULL,
    digital_signature TEXT, -- Device signature
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(device_id, log_sequence_number),
    CHECK (log_sequence_number > 0),
    
    INDEX idx_tamper_device_sequence (device_id, log_sequence_number),
    INDEX idx_tamper_entry_hash (entry_content_hash),
    INDEX idx_tamper_previous_hash (previous_entry_hash)
);

-- 11. synchronization_queue - Offline sync queue
CREATE TABLE synchronization_queue (
    queue_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES device_registry(device_id) ON DELETE CASCADE,
    record_type TEXT NOT NULL, -- 'telemetry', 'alert', 'feature', etc.
    record_reference_id UUID NOT NULL, -- ID of the actual record
    queued_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_status TEXT NOT NULL CHECK (sync_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')) DEFAULT 'PENDING',
    last_sync_attempt_utc TIMESTAMPTZ,
    sync_failure_count INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 4) DEFAULT 3, -- 1=highest, 4=lowest
    error_message TEXT,
    completed_at_utc TIMESTAMPTZ,
    
    INDEX idx_sync_device_status (device_id, sync_status),
    INDEX idx_sync_priority (priority DESC, queued_at_utc ASC),
    INDEX idx_sync_reference (record_type, record_reference_id)
);

-- 12. device_health_snapshots - Device health monitoring
CREATE TABLE device_health_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES device_registry(device_id) ON DELETE CASCADE,
    timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    disk_usage DECIMAL(5,2),
    network_latency_ms INTEGER,
    process_count INTEGER,
    uptime_seconds BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. analyst_device_assignments - Device access control
CREATE TABLE analyst_device_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analyst_id UUID NOT NULL REFERENCES analyst_users(user_id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES device_registry(device_id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by UUID REFERENCES analyst_users(user_id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    UNIQUE(analyst_id, device_id),
    INDEX idx_assignment_analyst (analyst_id),
    INDEX idx_assignment_device (device_id)
);

-- 14. incident_cases - Case management
CREATE TABLE incident_cases (
    case_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'CLOSED')) DEFAULT 'OPEN',
    created_by UUID NOT NULL REFERENCES analyst_users(user_id),
    assigned_to UUID REFERENCES analyst_users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    
    INDEX idx_cases_status (status),
    INDEX idx_cases_severity (severity),
    INDEX idx_cases_assigned (assigned_to)
);

-- 15. case_alerts - Link cases to alerts
CREATE TABLE case_alerts (
    case_alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES incident_cases(case_id) ON DELETE CASCADE,
    alert_id UUID NOT NULL REFERENCES alert_records(alert_id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by UUID NOT NULL REFERENCES analyst_users(user_id),
    
    UNIQUE(case_id, alert_id),
    INDEX idx_case_alerts_case (case_id),
    INDEX idx_case_alerts_alert (alert_id)
);

-- 16. audit_trail - Comprehensive audit logging
CREATE TABLE audit_trail (
    audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES analyst_users(user_id),
    device_id UUID REFERENCES device_registry(device_id),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_device (device_id),
    INDEX idx_audit_timestamp (timestamp_utc DESC),
    INDEX idx_audit_action (action)
);

-- 17. notification_rules - Alert notification management
CREATE TABLE notification_rules (
    rule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES analyst_users(user_id),
    trigger_conditions JSONB NOT NULL, -- Alert severity, device status, etc.
    notification_channels JSONB NOT NULL, -- Email, SMS, webhook, etc.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    INDEX idx_notification_active (is_active),
    INDEX idx_notification_creator (created_by)
);

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at columns
CREATE TRIGGER update_analyst_users_updated_at BEFORE UPDATE ON analyst_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_device_registry_updated_at BEFORE UPDATE ON device_registry FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_alert_records_updated_at BEFORE UPDATE ON alert_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_incident_cases_updated_at BEFORE UPDATE ON incident_cases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_rules_updated_at BEFORE UPDATE ON notification_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert initial admin user (will be created on first signup)
INSERT INTO analyst_users (user_id, full_name, role) 
SELECT id, email, 'ADMINISTRATOR' 
FROM auth.users 
WHERE email = 'admin@edgepulse.local' 
ON CONFLICT (user_id) DO NOTHING;
