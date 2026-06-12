-- ============================================================
-- EdgePulse Schema v3.0.0 — Multi-Tenant
-- Migration: 001_core_schema
-- Description: Core tables, enums, schemas, triggers, and views.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS devices;
CREATE SCHEMA IF NOT EXISTS telemetry;
CREATE SCHEMA IF NOT EXISTS internal;
CREATE SCHEMA IF NOT EXISTS organization;

-- ─── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE alert_severity    AS ENUM ('low','medium','high','critical');
    CREATE TYPE alert_status      AS ENUM ('PENDING','ACKNOWLEDGED','INVESTIGATED','CLOSED');
    CREATE TYPE telemetry_src     AS ENUM ('PROCESS','NETWORK','FILE','RESOURCE');
    CREATE TYPE device_status     AS ENUM ('online','offline','gone_silent','unsynced','isolated');
    CREATE TYPE device_risk       AS ENUM ('none','low','medium','high','critical');
    CREATE TYPE device_type       AS ENUM ('server','laptop','workstation','other');
    CREATE TYPE sync_status       AS ENUM ('PENDING','SYNCING','COMPLETED','FAILED');
    CREATE TYPE user_role         AS ENUM ('ORG_ANALYST','ORG_ADMIN','PLATFORM_ADMIN');
    CREATE TYPE account_status    AS ENUM ('PENDING','ACTIVE','SUSPENDED');
    CREATE TYPE privilege_level   AS ENUM ('user','admin','system');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Organization schema ────────────────────────────────────────────────────────

CREATE TABLE organization.organizations (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT        NOT NULL,
    slug            TEXT        NOT NULL UNIQUE,
    domain          TEXT,
    settings        JSONB       NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_org_slug   ON organization.organizations(slug);
CREATE INDEX idx_org_domain ON organization.organizations(domain);

CREATE TABLE organization.billing (
    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id      UUID        NOT NULL UNIQUE REFERENCES organization.organizations(id) ON DELETE CASCADE,
    stripe_customer_id   TEXT,
    plan_tier            TEXT        NOT NULL DEFAULT 'trial',
    billing_email        TEXT,
    billing_cycle        TEXT        DEFAULT 'monthly',
    currency             TEXT        DEFAULT 'USD',
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_billing_org ON organization.billing(organization_id);

-- ─── Users (public) ────────────────────────────────────────────────────────────
CREATE TABLE public.users (
    id                UUID            PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name         TEXT            NOT NULL,
    role              user_role       NOT NULL DEFAULT 'ORG_ANALYST',
    account_status    account_status  NOT NULL DEFAULT 'PENDING',
    organization_id   UUID            REFERENCES organization.organizations(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_org_role    ON public.users(organization_id, role);
CREATE INDEX idx_users_status      ON public.users(account_status);

-- ─── Devices (public) ──────────────────────────────────────────────────────────
CREATE TABLE public.devices (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT            NOT NULL,
    type                device_type     NOT NULL DEFAULT 'workstation',
    os                  TEXT            NOT NULL,
    ip                  INET,
    agent_version       TEXT            NOT NULL,
    status              device_status   NOT NULL DEFAULT 'online',
    risk                device_risk     NOT NULL DEFAULT 'none',
    alerts_count        INTEGER         NOT NULL DEFAULT 0,
    cpu_percent         NUMERIC(5,2)    NOT NULL DEFAULT 0,
    ram_percent         NUMERIC(5,2)    NOT NULL DEFAULT 0,
    sync_queue_depth    INTEGER         NOT NULL DEFAULT 0,
    hash_chain_ok       BOOLEAN         NOT NULL DEFAULT TRUE,
    actively_reporting  BOOLEAN         NOT NULL DEFAULT FALSE,
    enrolled_by         UUID            REFERENCES public.users(id),
    enrolled_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_seen           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    organization_id     UUID            NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_devices_org_active  ON public.devices(organization_id, is_active);
CREATE INDEX idx_devices_risk        ON public.devices(risk);
CREATE INDEX idx_devices_last_seen   ON public.devices(last_seen DESC);
CREATE INDEX idx_devices_name        ON public.devices(name);
CREATE INDEX idx_devices_enrolled_by ON public.devices(enrolled_by);

-- ─── API Keys (devices) ──────────────────────────────────────────────────────
CREATE TABLE devices.api_keys (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id       UUID        NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    key_hash        TEXT        NOT NULL UNIQUE,
    key_name        TEXT        NOT NULL,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    last_used_ip    INET,
    created_by      UUID        REFERENCES public.users(id),
    organization_id UUID        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,
    CONSTRAINT key_expiry_check CHECK (expires_at IS NULL OR expires_at > created_at)
);
CREATE INDEX idx_api_keys_device_active ON devices.api_keys(device_id, is_active);
CREATE INDEX idx_api_keys_org           ON devices.api_keys(organization_id);
CREATE INDEX idx_api_keys_created_by    ON devices.api_keys(created_by);

-- ─── Enrollment Tokens (devices) ────────────────────────────────────────────
CREATE TABLE devices.enrollment_tokens (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash      TEXT        NOT NULL UNIQUE,
    name            TEXT,
    created_by      UUID        NOT NULL REFERENCES public.users(id),
    expires_at      TIMESTAMPTZ NOT NULL,
    max_uses        INTEGER     NOT NULL DEFAULT 1 CHECK (max_uses > 0),
    current_uses    INTEGER     NOT NULL DEFAULT 0,
    is_used         BOOLEAN     NOT NULL DEFAULT FALSE,
    used_at         TIMESTAMPTZ,
    used_by_device  UUID        REFERENCES public.devices(id),
    organization_id UUID        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT token_usage_check  CHECK (current_uses <= max_uses),
    CONSTRAINT token_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX idx_enrollment_tokens_org_expires ON devices.enrollment_tokens(organization_id, expires_at);
CREATE INDEX idx_enrollment_tokens_created_by  ON devices.enrollment_tokens(created_by);
CREATE INDEX idx_enrollment_tokens_used_device ON devices.enrollment_tokens(used_by_device);

-- ─── Device Assignments (public) ────────────────────────────────────────────
CREATE TABLE public.device_assignments (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    device_id       UUID        NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by     UUID        REFERENCES public.users(id),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    organization_id UUID        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,
    UNIQUE(user_id, device_id)
);
CREATE INDEX idx_device_assignments_org_device ON public.device_assignments(organization_id, device_id);
CREATE INDEX idx_device_assignments_assigned_by ON public.device_assignments(assigned_by);

-- ─── Telemetry Events (telemetry) ──────────────────────────────────────────
CREATE TABLE telemetry.events (
    id                       UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id                UUID          NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    collected_at             TIMESTAMPTZ   NOT NULL,
    received_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    source                   telemetry_src NOT NULL,
    payload                  JSONB         NOT NULL DEFAULT '{}',
    collection_agent_version TEXT          NOT NULL,
    connectivity_state       TEXT          NOT NULL DEFAULT 'online'
                                           CHECK (connectivity_state IN ('online','offline')),
    payload_hash             TEXT          NOT NULL,
    organization_id          UUID          NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_events_device_collected ON telemetry.events(device_id, collected_at DESC);
CREATE INDEX idx_events_org_source       ON telemetry.events(organization_id, source);
CREATE INDEX idx_events_received         ON telemetry.events(received_at DESC);

-- ─── Feature Vectors (telemetry) ───────────────────────────────────────────
CREATE TABLE telemetry.feature_vectors (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id            UUID        NOT NULL REFERENCES telemetry.events(id) ON DELETE CASCADE,
    device_id           UUID        NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model_id            TEXT        NOT NULL,
    features            JSONB       NOT NULL DEFAULT '{}',
    feature_version     TEXT        NOT NULL DEFAULT 'v1.0',
    organization_id     UUID        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE
);
CREATE INDEX idx_fv_device_computed ON telemetry.feature_vectors(device_id, computed_at DESC);
CREATE INDEX idx_fv_org             ON telemetry.feature_vectors(organization_id);
CREATE INDEX idx_fv_event           ON telemetry.feature_vectors(event_id);

-- ─── Anomaly Scores (telemetry) ────────────────────────────────────────────
CREATE TABLE telemetry.anomaly_scores (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    feature_vector_id       UUID            REFERENCES telemetry.feature_vectors(id) ON DELETE SET NULL,
    device_id               UUID            NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    model_id                TEXT            NOT NULL,
    score                   NUMERIC(10,8)   NOT NULL CHECK (score BETWEEN 0 AND 1),
    label                   TEXT,
    threshold_applied       NUMERIC(10,8)   NOT NULL DEFAULT 0.75,
    above_threshold         BOOLEAN         NOT NULL DEFAULT FALSE,
    inference_latency_ms    INTEGER         NOT NULL DEFAULT 0 CHECK (inference_latency_ms >= 0),
    connectivity_state      TEXT            NOT NULL DEFAULT 'online'
                                            CHECK (connectivity_state IN ('online','offline')),
    organization_id         UUID            NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    scored_at               TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_asc_device_score    ON telemetry.anomaly_scores(device_id, score DESC);
CREATE INDEX idx_asc_above_threshold ON telemetry.anomaly_scores(device_id, above_threshold, created_at DESC);
CREATE INDEX idx_asc_org             ON telemetry.anomaly_scores(organization_id);
CREATE INDEX idx_asc_feature_vector  ON telemetry.anomaly_scores(feature_vector_id);

-- ─── Alerts (public) ───────────────────────────────────────────────────────
CREATE TABLE public.alerts (
    id                       UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id                UUID            NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    device_name              TEXT            NOT NULL,
    event_id                 UUID            REFERENCES telemetry.events(id) ON DELETE SET NULL,
    feature_vector_id        UUID            REFERENCES telemetry.feature_vectors(id) ON DELETE SET NULL,
    anomaly_score_id         UUID            REFERENCES telemetry.anomaly_scores(id) ON DELETE SET NULL,
    anomaly_score            NUMERIC(10,8)   NOT NULL CHECK (anomaly_score BETWEEN 0 AND 1),
    model_id                 TEXT            NOT NULL,
    collection_agent_version TEXT            NOT NULL,
    inference_latency_ms     INTEGER         NOT NULL DEFAULT 0,
    telemetry_source         telemetry_src   NOT NULL,
    title                    TEXT            NOT NULL,
    description              TEXT,
    severity                 alert_severity  NOT NULL,
    category                 TEXT            NOT NULL DEFAULT 'Unknown',
    confidence               NUMERIC(10,8)   NOT NULL DEFAULT 0,
    alert_type               TEXT            DEFAULT 'behavioral_deviation',
    detector_type            TEXT            DEFAULT 'unknown',
    detection_window_start   TIMESTAMPTZ,
    detection_window_end     TIMESTAMPTZ,
    detection_window_minutes INTEGER,
    explanation_json         JSONB           NOT NULL DEFAULT '{}',
    net_destination_ip       INET,
    net_destination_port     INTEGER         CHECK (net_destination_port BETWEEN 1 AND 65535 OR net_destination_port IS NULL),
    net_protocol             TEXT,
    net_duration_ms          INTEGER,
    proc_name                TEXT,
    proc_privilege_level     privilege_level,
    proc_pid                 INTEGER,
    status                   alert_status    NOT NULL DEFAULT 'PENDING',
    read                     BOOLEAN         NOT NULL DEFAULT FALSE,
    organization_id          UUID            NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,
    created_at               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    acknowledged_at          TIMESTAMPTZ,
    acknowledged_by          UUID            REFERENCES public.users(id),
    investigated_at          TIMESTAMPTZ,
    investigated_by          UUID            REFERENCES public.users(id),
    closed_at                TIMESTAMPTZ,
    closed_by                UUID            REFERENCES public.users(id)
);
CREATE INDEX idx_alerts_device_created  ON public.alerts(device_id, created_at DESC);
CREATE INDEX idx_alerts_org_severity    ON public.alerts(organization_id, severity, status);
CREATE INDEX idx_alerts_status_created  ON public.alerts(status, created_at DESC);
CREATE INDEX idx_alerts_read_status     ON public.alerts(read, status);
CREATE INDEX idx_alerts_acknowledged_by ON public.alerts(acknowledged_by);
CREATE INDEX idx_alerts_investigated_by ON public.alerts(investigated_by);
CREATE INDEX idx_alerts_closed_by       ON public.alerts(closed_by);
CREATE INDEX idx_alerts_event           ON public.alerts(event_id);
CREATE INDEX idx_alerts_feature_vector  ON public.alerts(feature_vector_id);
CREATE INDEX idx_alerts_anomaly_score   ON public.alerts(anomaly_score_id);

-- ─── Hash Chain Log (telemetry) ────────────────────────────────────────────
CREATE TABLE telemetry.hash_chain_log (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id               UUID        NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    sequence_number         BIGINT      NOT NULL,
    entry_type              TEXT        NOT NULL CHECK (entry_type IN (
                                            'TELEMETRY','ALERT','DETECTION','SYNC',
                                            'SYSTEM','AGENT','ANOMALY','ALERT_EVENT','HEALTH')),
    reference_id            TEXT,
    entry_timestamp         TIMESTAMPTZ NOT NULL,
    content_hash            TEXT        NOT NULL,
    previous_hash           TEXT        NOT NULL,
    digital_signature       TEXT,
    verified                BOOLEAN     NOT NULL DEFAULT FALSE,
    organization_id         UUID        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(device_id, sequence_number),
    CONSTRAINT seq_positive CHECK (sequence_number > 0)
);
CREATE INDEX idx_hash_chain_device_seq ON telemetry.hash_chain_log(device_id, sequence_number);
CREATE INDEX idx_hash_chain_org        ON telemetry.hash_chain_log(organization_id);
CREATE INDEX idx_hash_chain_content    ON telemetry.hash_chain_log(content_hash);
CREATE INDEX idx_hash_chain_previous   ON telemetry.hash_chain_log(previous_hash);
CREATE INDEX idx_hash_chain_type       ON telemetry.hash_chain_log(entry_type);

-- ─── Device Health (telemetry) ────────────────────────────────────────────
CREATE TABLE telemetry.device_health (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id           UUID        NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
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
    organization_id     UUID        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_device_health_device_created ON telemetry.device_health(device_id, created_at DESC);
CREATE INDEX idx_device_health_org            ON telemetry.device_health(organization_id);

-- ─── Sync Queue (internal) ────────────────────────────────────────────────
CREATE TABLE internal.sync_queue (
    id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id          UUID        NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    event_id           UUID        REFERENCES telemetry.events(id) ON DELETE SET NULL,
    status             sync_status NOT NULL DEFAULT 'PENDING',
    item_type          TEXT,
    item_id            TEXT,
    data_json          JSONB       NOT NULL DEFAULT '{}',
    priority           INTEGER     NOT NULL DEFAULT 0,
    attempts           INTEGER     NOT NULL DEFAULT 0,
    last_attempt       TIMESTAMPTZ,
    next_retry         TIMESTAMPTZ,
    last_error         TEXT,
    organization_id    UUID        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,
    synced_at          TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sync_queue_device_status   ON internal.sync_queue(device_id, status);
CREATE INDEX idx_sync_queue_org_status      ON internal.sync_queue(organization_id, status, created_at);
CREATE INDEX idx_sync_queue_priority        ON internal.sync_queue(priority DESC, created_at ASC);
CREATE INDEX idx_sync_queue_next_retry      ON internal.sync_queue(next_retry) WHERE status = 'FAILED';
CREATE INDEX idx_sync_queue_event           ON internal.sync_queue(event_id);

-- ─── Retention Settings (public) ──────────────────────────────────────────
CREATE TABLE public.retention_settings (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,
    device_id       UUID        REFERENCES public.devices(id) ON DELETE CASCADE,
    retention_days  INTEGER     NOT NULL DEFAULT 90 CHECK (retention_days > 0),
    data_types      JSONB       NOT NULL DEFAULT '["events","alerts","features","health","hash_chain"]',
    created_by      UUID        REFERENCES public.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_retention_org     ON public.retention_settings(organization_id);
CREATE INDEX idx_retention_device  ON public.retention_settings(device_id);
CREATE UNIQUE INDEX idx_retention_org_device ON public.retention_settings(organization_id, device_id) WHERE device_id IS NOT NULL;
CREATE UNIQUE INDEX idx_retention_org_global ON public.retention_settings(organization_id) WHERE device_id IS NULL;

-- ─── Privacy Settings (public) ────────────────────────────────────────────
CREATE TABLE public.privacy_settings (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id           UUID        UNIQUE REFERENCES public.devices(id) ON DELETE CASCADE,
    enhanced_mode       BOOLEAN     NOT NULL DEFAULT FALSE,
    settings            JSONB       NOT NULL DEFAULT '{}',
    data_minimization   BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_by          UUID        REFERENCES public.users(id),
    organization_id     UUID        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_privacy_settings_org    ON public.privacy_settings(organization_id);
CREATE INDEX idx_privacy_settings_updated_by ON public.privacy_settings(updated_by);

-- ─── Audit Logs (internal) ────────────────────────────────────────────────
CREATE TABLE internal.audit_logs (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        REFERENCES public.users(id),
    device_id       UUID        REFERENCES public.devices(id) ON DELETE CASCADE,
    action          TEXT        NOT NULL,
    resource_type   TEXT        NOT NULL,
    resource_id     UUID,
    old_values      JSONB,
    new_values      JSONB,
    severity        TEXT        NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'ERROR')),
    ip_address      INET,
    user_agent      TEXT,
    organization_id UUID        REFERENCES organization.organizations(id) ON DELETE CASCADE,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_user_time     ON internal.audit_logs(user_id, timestamp DESC);
CREATE INDEX idx_audit_logs_org_time      ON internal.audit_logs(organization_id, timestamp DESC);
CREATE INDEX idx_audit_logs_action        ON internal.audit_logs(action, timestamp DESC);

-- ─── Device Config (devices) ──────────────────────────────────────────────
CREATE TABLE devices.config (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id       UUID        REFERENCES public.devices(id) ON DELETE CASCADE,
    key             TEXT        NOT NULL,
    value           TEXT        NOT NULL,
    updated_by      UUID        REFERENCES public.users(id),
    organization_id UUID        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version         INTEGER     NOT NULL DEFAULT 1,
    UNIQUE(organization_id, device_id, key)
);
CREATE INDEX idx_config_org       ON devices.config(organization_id);
CREATE INDEX idx_config_updated_by ON devices.config(updated_by);

-- ─── Views ────────────────────────────────────────────────────────────────────

CREATE VIEW public.device_log_summary WITH (security_invoker = on) AS
SELECT
    d.id   AS device_id,
    d.name AS device_name,
    COALESCE(s.log_count, 0)          AS log_count,
    COALESCE(s.last_sequence, 0)      AS last_sequence,
    s.last_entry_timestamp
FROM public.devices d
LEFT JOIN (
    SELECT
        device_id,
        COUNT(*)                  AS log_count,
        MAX(sequence_number)      AS last_sequence,
        MAX(entry_timestamp)      AS last_entry_timestamp
    FROM telemetry.hash_chain_log
    GROUP BY device_id
) s ON d.id = s.device_id;

CREATE VIEW public.alert_summary WITH (security_invoker = on) AS
SELECT
    id,
    device_id,
    device_name,
    event_id,
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
    alert_type,
    detector_type,
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
FROM public.alerts;

-- ─── Trigger functions ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- Sync organization_id into auth.users raw_app_meta_data for JWT claims
CREATE OR REPLACE FUNCTION extensions.sync_organization_to_jwt()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE auth.users
    SET raw_app_meta_data =
        COALESCE(raw_app_meta_data, '{}'::jsonb) ||
        jsonb_build_object('organization_id', NEW.organization_id::TEXT)
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_sync_organization_to_jwt
    AFTER INSERT OR UPDATE OF organization_id ON public.users
    FOR EACH ROW EXECUTE FUNCTION extensions.sync_organization_to_jwt();

-- ─── updated_at triggers ────────────────────────────────────────────────────────

CREATE TRIGGER tr_organizations_updated
    BEFORE UPDATE ON organization.organizations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_billing_updated
    BEFORE UPDATE ON organization.billing
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_users_updated
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_devices_updated
    BEFORE UPDATE ON public.devices
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_alerts_updated
    BEFORE UPDATE ON public.alerts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_privacy_settings_updated
    BEFORE UPDATE ON public.privacy_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_sync_queue_updated
    BEFORE UPDATE ON internal.sync_queue
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_retention_settings_updated
    BEFORE UPDATE ON public.retention_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();