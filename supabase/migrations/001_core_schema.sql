-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 001_core_schema
-- Description: Core tables — devices, telemetry, alerts, cases
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE alert_severity    AS ENUM ('low','medium','high','critical');
    CREATE TYPE alert_status      AS ENUM ('PENDING','ACKNOWLEDGED','INVESTIGATED','CLOSED');
    CREATE TYPE telemetry_src     AS ENUM ('PROCESS','NETWORK','FILE','RESOURCE');
    CREATE TYPE device_status     AS ENUM ('online','offline','gone_silent','unsynced','isolated');
    CREATE TYPE device_risk       AS ENUM ('none','low','medium','high','critical');
    CREATE TYPE device_type       AS ENUM ('server','laptop','workstation','other');
    CREATE TYPE sync_status       AS ENUM ('PENDING','SYNCING','COMPLETED','FAILED');
    CREATE TYPE user_role         AS ENUM ('ANALYST','ADMINISTRATOR');
    CREATE TYPE case_severity     AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
    CREATE TYPE case_status       AS ENUM ('OPEN','IN_PROGRESS','CLOSED','ESCALATED');
    CREATE TYPE privilege_level   AS ENUM ('user','admin','system');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── 1. analyst_users ─────────────────────────────────────────────────────────
CREATE TABLE analyst_users (
    user_id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name         TEXT        NOT NULL,
    role              user_role   NOT NULL DEFAULT 'ANALYST',
    department        TEXT,
    is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
    approval_status   VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    approved_by       UUID        REFERENCES analyst_users(user_id),
    approved_at       TIMESTAMPTZ,
    rejection_reason  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_au_role             ON analyst_users(role);
CREATE INDEX idx_au_is_active        ON analyst_users(is_active);
CREATE INDEX idx_au_approval_status  ON analyst_users(approval_status);
CREATE INDEX idx_au_approved_by      ON analyst_users(approved_by);

-- ─── 2. device_registry ───────────────────────────────────────────────────────
CREATE TABLE device_registry (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT            NOT NULL,
    type                device_type     NOT NULL DEFAULT 'workstation',
    os                  TEXT            NOT NULL,
    ip                  INET,
    agent_version       TEXT            NOT NULL,
    -- live metrics
    status              device_status   NOT NULL DEFAULT 'online',
    risk                device_risk     NOT NULL DEFAULT 'none',
    alerts_count        INTEGER         NOT NULL DEFAULT 0,
    cpu_percent         NUMERIC(5,2)    NOT NULL DEFAULT 0,
    ram_percent         NUMERIC(5,2)    NOT NULL DEFAULT 0,
    sync_queue_depth    INTEGER         NOT NULL DEFAULT 0,
    hash_chain_ok       BOOLEAN         NOT NULL DEFAULT TRUE,
    actively_reporting  BOOLEAN         NOT NULL DEFAULT FALSE,
    -- enrollment metadata
    enrolled_by         UUID            REFERENCES analyst_users(user_id),
    enrolled_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_seen           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dr_name      ON device_registry(name);
CREATE INDEX idx_dr_status    ON device_registry(status);
CREATE INDEX idx_dr_risk      ON device_registry(risk);
CREATE INDEX idx_dr_last_seen ON device_registry(last_seen DESC);
CREATE INDEX idx_dr_is_active ON device_registry(is_active);

-- ─── 3. agent_api_keys ───────────────────────────────────────────────────────
CREATE TABLE agent_api_keys (
    key_id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id       UUID        NOT NULL REFERENCES device_registry(id) ON DELETE CASCADE,
    key_hash        TEXT        NOT NULL UNIQUE,
    key_name        TEXT        NOT NULL,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    last_used_ip    INET,
    created_by      UUID        REFERENCES analyst_users(user_id),
    CONSTRAINT key_expiry_check CHECK (expires_at IS NULL OR expires_at > created_at)
);
CREATE INDEX idx_aak_device_id ON agent_api_keys(device_id);
CREATE INDEX idx_aak_is_active ON agent_api_keys(is_active);

-- ─── 4. device_enrollment_tokens ─────────────────────────────────────────────
CREATE TABLE device_enrollment_tokens (
    token_id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash          TEXT        NOT NULL UNIQUE,
    name                TEXT,
    created_by          UUID        NOT NULL REFERENCES analyst_users(user_id),
    expires_at          TIMESTAMPTZ NOT NULL,
    max_uses            INTEGER     NOT NULL DEFAULT 1 CHECK (max_uses > 0),
    current_uses        INTEGER     NOT NULL DEFAULT 0,
    is_used             BOOLEAN     NOT NULL DEFAULT FALSE,
    used_at             TIMESTAMPTZ,
    used_by_device_id   UUID        REFERENCES device_registry(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT token_usage_check  CHECK (current_uses <= max_uses),
    CONSTRAINT token_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX idx_det_expires_at ON device_enrollment_tokens(expires_at);

-- ─── 5. analyst_device_assignments ───────────────────────────────────────────
CREATE TABLE analyst_device_assignments (
    assignment_id   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    analyst_id      UUID        NOT NULL REFERENCES analyst_users(user_id) ON DELETE CASCADE,
    device_id       UUID        NOT NULL REFERENCES device_registry(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by     UUID        REFERENCES analyst_users(user_id),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    UNIQUE(analyst_id, device_id)
);
CREATE INDEX idx_ada_analyst_id ON analyst_device_assignments(analyst_id);
CREATE INDEX idx_ada_device_id  ON analyst_device_assignments(device_id);

-- ─── 6. telemetry_events ─────────────────────────────────────────────────────
CREATE TABLE telemetry_events (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id               UUID            NOT NULL REFERENCES device_registry(id) ON DELETE CASCADE,
    collected_at            TIMESTAMPTZ     NOT NULL,
    received_at             TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    source                  telemetry_src   NOT NULL,
    payload                 JSONB           NOT NULL DEFAULT '{}',
    collection_agent_version TEXT           NOT NULL,
    connectivity_state      TEXT            NOT NULL DEFAULT 'online'
                                CHECK (connectivity_state IN ('online','offline')),
    payload_hash            TEXT            NOT NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_te_device_collected ON telemetry_events(device_id, collected_at DESC);
CREATE INDEX idx_te_source           ON telemetry_events(source);
CREATE INDEX idx_te_received         ON telemetry_events(received_at DESC);

-- ─── 7. feature_vectors ──────────────────────────────────────────────────────
CREATE TABLE feature_vectors (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    telemetry_event_id  UUID        NOT NULL REFERENCES telemetry_events(id) ON DELETE CASCADE,
    device_id           UUID        NOT NULL REFERENCES device_registry(id) ON DELETE CASCADE,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model_id            TEXT        NOT NULL,
    features            JSONB       NOT NULL DEFAULT '{}',
    feature_version     TEXT        NOT NULL DEFAULT 'v1.0'
);
CREATE INDEX idx_fv_device_computed ON feature_vectors(device_id, computed_at DESC);
CREATE INDEX idx_fv_telemetry_event ON feature_vectors(telemetry_event_id);

-- ─── 8. anomaly_scores ───────────────────────────────────────────────────────
CREATE TABLE anomaly_scores (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    feature_vector_id       UUID            REFERENCES feature_vectors(id) ON DELETE SET NULL,
    device_id               UUID            NOT NULL REFERENCES device_registry(id) ON DELETE CASCADE,
    model_id                TEXT            NOT NULL,
    score                   NUMERIC(10,8)   NOT NULL CHECK (score BETWEEN 0 AND 1),
    label                   TEXT,
    threshold_applied       NUMERIC(10,8)   NOT NULL DEFAULT 0.75,
    above_threshold         BOOLEAN         NOT NULL DEFAULT FALSE,
    inference_latency_ms    INTEGER         NOT NULL DEFAULT 0 CHECK (inference_latency_ms >= 0),
    connectivity_state      TEXT            NOT NULL DEFAULT 'online'
                                CHECK (connectivity_state IN ('online','offline')),
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    scored_at               TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_asc_device_score    ON anomaly_scores(device_id, score DESC);
CREATE INDEX idx_asc_above_threshold ON anomaly_scores(above_threshold, created_at DESC);
CREATE INDEX idx_asc_device_created  ON anomaly_scores(device_id, created_at DESC);

-- ─── 9. alert_records ────────────────────────────────────────────────────────
CREATE TABLE alert_records (
    alert_id                UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id               UUID            NOT NULL REFERENCES device_registry(id) ON DELETE CASCADE,
    device_name             TEXT            NOT NULL,
    telemetry_event_id      UUID            REFERENCES telemetry_events(id) ON DELETE SET NULL,
    feature_vector_id       UUID            REFERENCES feature_vectors(id) ON DELETE SET NULL,
    anomaly_score_id        UUID            REFERENCES anomaly_scores(id) ON DELETE SET NULL,
    -- scoring
    anomaly_score           NUMERIC(10,8)   NOT NULL CHECK (anomaly_score BETWEEN 0 AND 1),
    model_id                TEXT            NOT NULL,
    collection_agent_version TEXT           NOT NULL,
    inference_latency_ms    INTEGER         NOT NULL DEFAULT 0,
    telemetry_source        telemetry_src   NOT NULL,
    -- display fields
    title                   TEXT            NOT NULL,
    description             TEXT,
    severity                alert_severity  NOT NULL,
    category                TEXT            NOT NULL DEFAULT 'Unknown',
    confidence              NUMERIC(10,8)   NOT NULL DEFAULT 0,
    -- detection window
    detection_window_start  TIMESTAMPTZ,
    detection_window_end    TIMESTAMPTZ,
    detection_window_minutes INTEGER,
    -- explainability (SHAP)
    explanation_json        JSONB           NOT NULL DEFAULT '{}',
    -- network-specific
    net_destination_ip      INET,
    net_destination_port    INTEGER         CHECK (net_destination_port BETWEEN 1 AND 65535 OR net_destination_port IS NULL),
    net_protocol            TEXT,
    net_duration_ms         INTEGER,
    -- process-specific
    proc_name               TEXT,
    proc_privilege_level    privilege_level,
    proc_pid                INTEGER,
    -- lifecycle
    status                  alert_status    NOT NULL DEFAULT 'PENDING',
    read                    BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    acknowledged_at         TIMESTAMPTZ,
    acknowledged_by         UUID            REFERENCES analyst_users(user_id),
    investigated_at         TIMESTAMPTZ,
    investigated_by         UUID            REFERENCES analyst_users(user_id),
    closed_at               TIMESTAMPTZ,
    closed_by               UUID            REFERENCES analyst_users(user_id)
);

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

CREATE INDEX idx_ar_device_created  ON alert_records(device_id, created_at DESC);
CREATE INDEX idx_ar_severity_status ON alert_records(severity, status);
CREATE INDEX idx_ar_status_created  ON alert_records(status, created_at DESC);
CREATE INDEX idx_ar_read            ON alert_records(read, status);

-- ─── 10. tamper_evident_log ───────────────────────────────────────────────────
CREATE TABLE tamper_evident_log (
    log_id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id               UUID        NOT NULL REFERENCES device_registry(id) ON DELETE CASCADE,
    log_sequence_number     BIGINT      NOT NULL,
    log_entry_type          TEXT        NOT NULL CHECK (log_entry_type IN ('TELEMETRY','ALERT','DETECTION','SYNC','SYSTEM','AGENT','ANOMALY','ALERT_EVENT','HEALTH')),
    log_entry_reference_id  TEXT,
    entry_timestamp_utc     TIMESTAMPTZ NOT NULL,
    entry_content_hash      TEXT        NOT NULL,
    previous_entry_hash     TEXT        NOT NULL,
    digital_signature       TEXT,
    verified                BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(device_id, log_sequence_number),
    CONSTRAINT seq_positive CHECK (log_sequence_number > 0)
);
CREATE INDEX idx_tel_device_seq  ON tamper_evident_log(device_id, log_sequence_number);
CREATE INDEX idx_tel_entry_hash  ON tamper_evident_log(entry_content_hash);
CREATE INDEX idx_tel_prev_hash   ON tamper_evident_log(previous_entry_hash);

-- ─── 11. device_health_snapshots ──────────────────────────────────────────────
CREATE TABLE device_health_snapshots (
    snapshot_id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id           UUID        NOT NULL REFERENCES device_registry(id) ON DELETE CASCADE,
    status              TEXT        NOT NULL CHECK (status IN ('ONLINE','OFFLINE','WARNING','ERROR')),
    cpu_usage           NUMERIC(5,2),
    memory_usage        NUMERIC(5,2),
    disk_usage          NUMERIC(5,2),
    network_status      BOOLEAN     NOT NULL DEFAULT TRUE,
    alerts_last_24h     INTEGER     NOT NULL DEFAULT 0,
    uptime_percentage   NUMERIC(5,2),
    response_time_ms    INTEGER,
    error_count         INTEGER     NOT NULL DEFAULT 0,
    warning_count       INTEGER     NOT NULL DEFAULT 0,
    last_restart        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dhs_device_created ON device_health_snapshots(device_id, created_at DESC);

-- ─── 12. incident_cases ───────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS case_seq;

CREATE TABLE incident_cases (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_number     TEXT            NOT NULL UNIQUE DEFAULT 'EP-' || LPAD(nextval('case_seq')::TEXT, 6, '0'),
    title           TEXT            NOT NULL,
    description     TEXT,
    severity        case_severity   NOT NULL,
    status          case_status     NOT NULL DEFAULT 'OPEN',
    assigned_to     UUID            REFERENCES analyst_users(user_id),
    created_by      UUID            NOT NULL REFERENCES analyst_users(user_id),
    started_at      TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    closed_by       UUID            REFERENCES analyst_users(user_id),
    alert_count     INTEGER         NOT NULL DEFAULT 0,
    last_activity   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ic_status   ON incident_cases(status);
CREATE INDEX idx_ic_severity ON incident_cases(severity);
CREATE INDEX idx_ic_assigned ON incident_cases(assigned_to);

-- ─── 13. case_alerts ──────────────────────────────────────────────────────────
CREATE TABLE case_alerts (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id         UUID            NOT NULL REFERENCES incident_cases(id) ON DELETE CASCADE,
    alert_id        UUID            NOT NULL REFERENCES alert_records(alert_id) ON DELETE CASCADE,
    alert_severity  alert_severity  NOT NULL DEFAULT 'low',
    alert_status    alert_status    NOT NULL DEFAULT 'PENDING',
    device_id       UUID            REFERENCES device_registry(id) ON DELETE SET NULL,
    explanation_json JSONB          NOT NULL DEFAULT '{}',
    added_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    added_by        UUID            NOT NULL REFERENCES analyst_users(user_id),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE(case_id, alert_id)
);
CREATE INDEX idx_ca_case_id  ON case_alerts(case_id);
CREATE INDEX idx_ca_alert_id ON case_alerts(alert_id);

-- ─── 14. case_notes ───────────────────────────────────────────────────────────
CREATE TABLE case_notes (
    note_id     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id     UUID        NOT NULL REFERENCES incident_cases(id) ON DELETE CASCADE,
    content     TEXT        NOT NULL,
    created_by  UUID        NOT NULL REFERENCES analyst_users(user_id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cn_case_id ON case_notes(case_id);

-- ─── 15. sync_queue ───────────────────────────────────────────────────────────
CREATE TABLE sync_queue (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id       UUID            NOT NULL REFERENCES device_registry(id) ON DELETE CASCADE,
    telemetry_event_id UUID         REFERENCES telemetry_events(id) ON DELETE SET NULL,
    status          sync_status     NOT NULL DEFAULT 'PENDING',
    queued_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    synced_at       TIMESTAMPTZ,
    retry_count     INTEGER         NOT NULL DEFAULT 0,
    last_error      TEXT,
    item_type       TEXT,
    item_id         TEXT,
    data_json       JSONB           NOT NULL DEFAULT '{}',
    attempts        INTEGER         NOT NULL DEFAULT 0,
    last_attempt    TIMESTAMPTZ,
    next_retry      TIMESTAMPTZ,
    priority        INTEGER         NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sq_device_status   ON sync_queue(device_id, status);
CREATE INDEX idx_sq_status_queued   ON sync_queue(status, queued_at);
CREATE INDEX idx_sq_priority        ON sync_queue(priority DESC, created_at ASC);

-- ─── 16. retention_settings ──────────────────────────────────────────────────
CREATE TABLE retention_settings (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id       TEXT        NOT NULL UNIQUE DEFAULT 'global',
    retention_days  INTEGER     NOT NULL DEFAULT 90 CHECK (retention_days > 0),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO retention_settings (device_id, retention_days) VALUES ('global', 90)
    ON CONFLICT (device_id) DO NOTHING;

-- ─── 17. privacy_settings ─────────────────────────────────────────────────────
CREATE TABLE privacy_settings (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id               UUID        REFERENCES device_registry(id) ON DELETE CASCADE,
    enhanced_mode           BOOLEAN     NOT NULL DEFAULT FALSE,
    anonymize_ips           BOOLEAN     NOT NULL DEFAULT TRUE,
    encrypt_pii             BOOLEAN     NOT NULL DEFAULT TRUE,
    mask_usernames          BOOLEAN     NOT NULL DEFAULT FALSE,
    redact_sensitive_data   BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_by              UUID        REFERENCES analyst_users(user_id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(device_id)
);
CREATE INDEX idx_ps_device_id ON privacy_settings(device_id);

-- ─── 18. audit_trail ──────────────────────────────────────────────────────────
CREATE TABLE audit_trail (
    audit_id        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        REFERENCES analyst_users(user_id),
    device_id       UUID        REFERENCES device_registry(id),
    action          TEXT        NOT NULL,
    resource_type   TEXT        NOT NULL,
    resource_id     UUID,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    user_agent      TEXT,
    timestamp_utc   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_at_user_id   ON audit_trail(user_id);
CREATE INDEX idx_at_timestamp ON audit_trail(timestamp_utc DESC);
CREATE INDEX idx_at_action    ON audit_trail(action);

-- ─── 19. notification_rules ───────────────────────────────────────────────────
CREATE TABLE notification_rules (
    rule_id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    TEXT        NOT NULL,
    description             TEXT,
    created_by              UUID        NOT NULL REFERENCES analyst_users(user_id),
    trigger_conditions      JSONB       NOT NULL DEFAULT '{}',
    notification_channels   JSONB       NOT NULL DEFAULT '{}',
    is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 20. agent_config ─────────────────────────────────────────────────────────
CREATE TABLE agent_config (
    config_id   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id   UUID        REFERENCES device_registry(id) ON DELETE CASCADE,
    key         TEXT        NOT NULL,
    value       TEXT        NOT NULL,
    updated_by  UUID        REFERENCES analyst_users(user_id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version     INTEGER     NOT NULL DEFAULT 1,
    UNIQUE(device_id, key)
);

-- Pending users awaiting admin approval
CREATE VIEW pending_users AS
SELECT
    au.user_id,
    au.full_name,
    au.department,
    au.created_at,
    auth.email      AS auth_email,
    auth.raw_user_meta_data->>'department' AS auth_department
FROM analyst_users au
JOIN auth.users auth ON au.user_id = auth.id
WHERE au.approval_status = 'PENDING'
  AND au.is_active        = TRUE
  AND au.role             = 'ANALYST';

-- Device assignment management view
CREATE VIEW device_assignment_details AS
SELECT
    ada.assignment_id,
    ada.analyst_id,
    ada.device_id,
    ada.assigned_at,
    ada.assigned_by,
    ada.is_active,
    au.full_name    AS analyst_name,
    auth.email      AS analyst_email,
    dr.name         AS device_name,
    dr.type         AS device_type,
    dr.status       AS device_status,
    dr.ip           AS device_ip
FROM analyst_device_assignments ada
JOIN analyst_users  au   ON ada.analyst_id = au.user_id
JOIN auth.users     auth ON au.user_id     = auth.id
JOIN device_registry dr  ON ada.device_id  = dr.id
WHERE ada.is_active = TRUE;

-- ─── Triggers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER tr_analyst_users_updated       BEFORE UPDATE ON analyst_users           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tr_device_registry_updated     BEFORE UPDATE ON device_registry          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tr_alert_records_updated       BEFORE UPDATE ON alert_records            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tr_incident_cases_updated      BEFORE UPDATE ON incident_cases           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tr_notification_rules_updated  BEFORE UPDATE ON notification_rules       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tr_privacy_settings_updated    BEFORE UPDATE ON privacy_settings         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tr_sync_queue_updated          BEFORE UPDATE ON sync_queue               FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Keep incident_cases.alert_count in sync when case_alerts rows change
CREATE OR REPLACE FUNCTION sync_case_alert_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

CREATE TRIGGER tr_case_alerts_count
    AFTER INSERT OR DELETE ON case_alerts
    FOR EACH ROW EXECUTE FUNCTION sync_case_alert_count();

CREATE OR REPLACE FUNCTION sync_case_alert_metadata()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE case_alerts
    SET    alert_severity    = NEW.severity,
           alert_status      = NEW.status,
           explanation_json  = NEW.explanation_json
    WHERE  alert_id = NEW.alert_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_alert_records_case_sync
    AFTER UPDATE OF severity, status, explanation_json ON alert_records
    FOR EACH ROW EXECUTE FUNCTION sync_case_alert_metadata();

-- ─── Auto-provision trigger ────────────────
-- New users start as PENDING; an admin must approve them before they gain access.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
    INSERT INTO analyst_users (user_id, full_name, role, approval_status)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        'ANALYST',
        'PENDING'
    )
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();