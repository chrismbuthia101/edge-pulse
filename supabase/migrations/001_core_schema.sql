-- ============================================================
-- EdgePulse Schema v3.1.0 — Multi-Tenant
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    domain TEXT,
    logo_url TEXT,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX idx_org_slug ON organization.organizations (slug);

CREATE INDEX idx_org_domain ON organization.organizations (domain);

CREATE TABLE organization.billing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    organization_id UUID NOT NULL UNIQUE REFERENCES organization.organizations (id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    plan_tier TEXT NOT NULL DEFAULT 'trial',
    billing_email TEXT,
    billing_cycle TEXT DEFAULT 'monthly',
    currency TEXT DEFAULT 'USD',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX idx_billing_org ON organization.billing (organization_id);

CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

-- ─── Organization Profiles — per-org role, status, and job title ────────────
CREATE TABLE organization.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organization.organizations (id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'ORG_ANALYST',
    account_status account_status NOT NULL DEFAULT 'PENDING',
    job_title TEXT,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    UNIQUE (user_id, organization_id)
);

CREATE INDEX idx_profiles_user ON organization.profiles (user_id);

CREATE INDEX idx_profiles_org_role ON organization.profiles (organization_id, role);

CREATE INDEX idx_profiles_status ON organization.profiles (account_status);

-- ─── Devices (public) ──────────────────────────────────────────────────────────
CREATE TABLE public.devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    name TEXT NOT NULL,
    type device_type NOT NULL DEFAULT 'workstation',
    os TEXT NOT NULL,
    ip INET,
    agent_version TEXT NOT NULL,
    status device_status NOT NULL DEFAULT 'online',
    risk device_risk NOT NULL DEFAULT 'none',
    alerts_count INTEGER NOT NULL DEFAULT 0,
    cpu_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    ram_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    sync_queue_depth INTEGER NOT NULL DEFAULT 0,
    actively_reporting BOOLEAN NOT NULL DEFAULT FALSE,
    enrolled_by UUID REFERENCES public.users (id),
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deactivated_at TIMESTAMPTZ,
    deactivated_reason TEXT,
    deactivated_by UUID REFERENCES public.users (id),
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    tags TEXT [] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX idx_devices_org_active ON public.devices (organization_id, is_active);

CREATE INDEX idx_devices_risk ON public.devices (risk);

CREATE INDEX idx_devices_last_seen ON public.devices (last_seen DESC);

CREATE INDEX idx_devices_name ON public.devices (name);

CREATE INDEX idx_devices_enrolled_by ON public.devices (enrolled_by);

-- ─── API Keys (devices) ──────────────────────────────────────────────────────
CREATE TABLE devices.api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL UNIQUE,
    key_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    last_used_ip INET,
    created_by UUID REFERENCES public.users (id),
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    CONSTRAINT key_expiry_check CHECK (
        expires_at IS NULL
        OR expires_at > created_at
    )
);

CREATE INDEX idx_api_keys_device_active ON devices.api_keys (device_id, is_active);

CREATE INDEX idx_api_keys_org ON devices.api_keys (organization_id);

CREATE INDEX idx_api_keys_created_by ON devices.api_keys (created_by);

-- ─── Enrollment Tokens (devices) ────────────────────────────────────────────
CREATE TABLE devices.enrollment_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    token_hash TEXT NOT NULL UNIQUE,
    name TEXT,
    created_by UUID NOT NULL REFERENCES public.users (id),
    expires_at TIMESTAMPTZ NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
    current_uses INTEGER NOT NULL DEFAULT 0,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    used_by_device UUID REFERENCES public.devices (id),
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    CONSTRAINT token_usage_check CHECK (current_uses <= max_uses),
    CONSTRAINT token_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX idx_enrollment_tokens_org_expires ON devices.enrollment_tokens (organization_id, expires_at);

CREATE INDEX idx_enrollment_tokens_created_by ON devices.enrollment_tokens (created_by);

CREATE INDEX idx_enrollment_tokens_used_device ON devices.enrollment_tokens (used_by_device);

-- ─── Device Assignments (public) ────────────────────────────────────────────
CREATE TABLE public.device_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    assigned_by UUID REFERENCES public.users (id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    UNIQUE (user_id, device_id)
);

CREATE INDEX idx_device_assignments_org_device ON public.device_assignments (organization_id, device_id);

CREATE INDEX idx_device_assignments_assigned_by ON public.device_assignments (assigned_by);

-- ─── Telemetry Events (telemetry) ──────────────────────────────────────────
CREATE TABLE telemetry.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
    event_id UUID REFERENCES telemetry.events (id) ON DELETE CASCADE,
    feature_name TEXT NOT NULL,
    feature_type TEXT NOT NULL CHECK (
        feature_type IN (
            'statistical',
            'temporal',
            'frequency_domain',
            'custom'
        )
    ),
    value DOUBLE PRECISION NOT NULL,
    metadata JSONB,
    source TEXT,
    session_id UUID,
    payload JSONB NOT NULL DEFAULT '{}',
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    integrity_hash TEXT
);

CREATE INDEX idx_events_device_collected ON telemetry.events (device_id, created_at DESC);

CREATE INDEX idx_events_org_source ON telemetry.events (organization_id, source);

CREATE INDEX idx_events_received ON telemetry.events (received_at DESC);

CREATE INDEX idx_events_session ON telemetry.events (session_id);

CREATE INDEX idx_events_payload_gin ON telemetry.events USING GIN (payload);

-- ─── Feature Vectors (telemetry) ───────────────────────────────────────────
CREATE TABLE telemetry.feature_vectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    event_id UUID REFERENCES telemetry.events (id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    model_id TEXT NOT NULL,
    features JSONB NOT NULL DEFAULT '{}',
    feature_version TEXT NOT NULL DEFAULT 'v1.0',
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    integrity_hash TEXT
);

CREATE INDEX idx_fv_device_computed ON telemetry.feature_vectors (device_id, computed_at DESC);

CREATE INDEX idx_fv_org ON telemetry.feature_vectors (organization_id);

CREATE INDEX idx_fv_event ON telemetry.feature_vectors (event_id);

-- ─── Anomaly Scores (telemetry) ────────────────────────────────────────────
CREATE TABLE telemetry.anomaly_scores (
    id UUID NOT NULL DEFAULT uuid_generate_v4 (),
    feature_vector_id UUID REFERENCES telemetry.feature_vectors (id) ON DELETE SET NULL,
    device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    score NUMERIC(10, 8) NOT NULL CHECK (score BETWEEN 0 AND 1),
    label TEXT,
    threshold_applied NUMERIC(10, 8) NOT NULL DEFAULT 0.75,
    above_threshold BOOLEAN NOT NULL DEFAULT FALSE,
    inference_latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (inference_latency_ms >= 0),
    connectivity_state TEXT NOT NULL DEFAULT 'online' CHECK (
        connectivity_state IN ('online', 'offline')
    ),
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    integrity_hash TEXT,
    PRIMARY KEY (id, scored_at)
)
PARTITION BY
    RANGE (scored_at);

CREATE TABLE telemetry.anomaly_scores_default PARTITION OF telemetry.anomaly_scores DEFAULT;

CREATE INDEX idx_asc_device_score ON telemetry.anomaly_scores (device_id, score DESC);

CREATE INDEX idx_asc_above_threshold ON telemetry.anomaly_scores (
    device_id,
    above_threshold,
    created_at DESC
);

CREATE INDEX idx_asc_org ON telemetry.anomaly_scores (organization_id);

CREATE INDEX idx_asc_feature_vector ON telemetry.anomaly_scores (feature_vector_id);

CREATE INDEX idx_asc_created ON telemetry.anomaly_scores (created_at DESC);

-- ─── Alerts (public) ───────────────────────────────────────────────────────
CREATE TABLE public.alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
    parent_alert_id UUID REFERENCES public.alerts (id) ON DELETE SET NULL,
    event_id UUID REFERENCES telemetry.events (id) ON DELETE SET NULL,
    feature_vector_id UUID REFERENCES telemetry.feature_vectors (id) ON DELETE SET NULL,
    anomaly_score_id UUID,
    anomaly_score NUMERIC(10, 8) NOT NULL CHECK (anomaly_score BETWEEN 0 AND 1),
    model_id TEXT NOT NULL,
    inference_latency_ms INTEGER NOT NULL DEFAULT 0,
    telemetry_source telemetry_src NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    severity alert_severity NOT NULL,
    category TEXT NOT NULL DEFAULT 'Unknown',
    confidence NUMERIC(10, 8) NOT NULL DEFAULT 0,
    alert_type TEXT DEFAULT 'behavioral_deviation',
    detector_type TEXT DEFAULT 'unknown',
    detection_window_start TIMESTAMPTZ,
    detection_window_end TIMESTAMPTZ,
    explanation_json JSONB NOT NULL DEFAULT '{}',
    tags TEXT [],
    source_ip INET,
    mitre_technique_id TEXT,
    net_destination_ip INET,
    net_destination_port INTEGER CHECK (
        net_destination_port BETWEEN 1 AND 65535
        OR net_destination_port IS NULL
    ),
    net_protocol TEXT,
    net_duration_ms INTEGER,
    proc_name TEXT,
    proc_privilege_level privilege_level,
    proc_pid INTEGER,
    status alert_status NOT NULL DEFAULT 'PENDING',
    read BOOLEAN NOT NULL DEFAULT FALSE,
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES public.users (id),
    investigated_at TIMESTAMPTZ,
    investigated_by UUID REFERENCES public.users (id),
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES public.users (id),
    integrity_hash TEXT
);

CREATE INDEX idx_alerts_device_created ON public.alerts (device_id, created_at DESC);

CREATE INDEX idx_alerts_org_severity ON public.alerts (
    organization_id,
    severity,
    status
);

CREATE INDEX idx_alerts_status_created ON public.alerts (status, created_at DESC);

CREATE INDEX idx_alerts_read_status ON public.alerts (read, status);

CREATE INDEX idx_alerts_acknowledged_by ON public.alerts (acknowledged_by);

CREATE INDEX idx_alerts_investigated_by ON public.alerts (investigated_by);

CREATE INDEX idx_alerts_closed_by ON public.alerts (closed_by);

CREATE INDEX idx_alerts_event ON public.alerts (event_id);

CREATE INDEX idx_alerts_feature_vector ON public.alerts (feature_vector_id);

CREATE INDEX idx_alerts_anomaly_score ON public.alerts (anomaly_score_id);

CREATE INDEX idx_alerts_pending_unread ON public.alerts (status, read)
WHERE
    status = 'PENDING'
    AND read = FALSE;

-- ─── Device Health (telemetry) ────────────────────────────────────────────
CREATE TABLE telemetry.device_health (
    id UUID NOT NULL DEFAULT uuid_generate_v4 (),
    device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (
        status IN (
            'ONLINE',
            'OFFLINE',
            'WARNING',
            'ERROR'
        )
    ),
    cpu_usage NUMERIC(5, 2),
    memory_usage NUMERIC(5, 2),
    disk_usage NUMERIC(5, 2),
    network_status BOOLEAN NOT NULL DEFAULT TRUE,
    alerts_last_24h INTEGER NOT NULL DEFAULT 0,
    uptime_percentage NUMERIC(5, 2),
    response_time_ms INTEGER,
    error_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    last_restart TIMESTAMPTZ,
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    integrity_hash TEXT,
    PRIMARY KEY (id, created_at)
)
PARTITION BY
    RANGE (created_at);

-- Default partition catches all rows; create monthly partitions in production for performance.
CREATE TABLE telemetry.device_health_default PARTITION OF telemetry.device_health DEFAULT;

CREATE INDEX idx_device_health_device_created ON telemetry.device_health (device_id, created_at DESC);

CREATE INDEX idx_device_health_org ON telemetry.device_health (organization_id);

-- ─── Sync Queue (internal) ────────────────────────────────────────────────
CREATE TABLE internal.sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
    event_id UUID REFERENCES telemetry.events (id) ON DELETE SET NULL,
    status sync_status NOT NULL DEFAULT 'PENDING',
    item_type TEXT,
    item_id TEXT,
    data_json JSONB NOT NULL DEFAULT '{}',
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt TIMESTAMPTZ,
    next_retry TIMESTAMPTZ,
    last_error TEXT,
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX idx_sync_queue_device_status ON internal.sync_queue (device_id, status);

CREATE INDEX idx_sync_queue_org_status ON internal.sync_queue (
    organization_id,
    status,
    created_at
);

CREATE INDEX idx_sync_queue_priority ON internal.sync_queue (priority DESC, created_at ASC);

CREATE INDEX idx_sync_queue_next_retry ON internal.sync_queue (next_retry)
WHERE
    status = 'FAILED';

CREATE INDEX idx_sync_queue_event ON internal.sync_queue (event_id);

-- ─── Retention Settings (public) ──────────────────────────────────────────
CREATE TABLE public.retention_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    device_id UUID REFERENCES public.devices (id) ON DELETE CASCADE,
    retention_days INTEGER NOT NULL DEFAULT 90 CHECK (retention_days > 0),
    data_types TEXT [] NOT NULL DEFAULT ARRAY ['events','alerts','features','health'],
    created_by UUID REFERENCES public.users (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX idx_retention_org ON public.retention_settings (organization_id);

CREATE INDEX idx_retention_device ON public.retention_settings (device_id);

CREATE UNIQUE INDEX idx_retention_org_device ON public.retention_settings (organization_id, device_id)
WHERE
    device_id IS NOT NULL;

CREATE UNIQUE INDEX idx_retention_org_global ON public.retention_settings (organization_id)
WHERE
    device_id IS NULL;

-- ─── Privacy Settings (public) ────────────────────────────────────────────
CREATE TABLE public.privacy_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    device_id UUID UNIQUE REFERENCES public.devices (id) ON DELETE CASCADE,
    enhanced_mode BOOLEAN NOT NULL DEFAULT FALSE,
    settings JSONB NOT NULL DEFAULT '{}',
    data_minimization BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by UUID REFERENCES public.users (id),
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX idx_privacy_settings_org ON public.privacy_settings (organization_id);

CREATE INDEX idx_privacy_settings_updated_by ON public.privacy_settings (updated_by);

-- ─── Audit Logs (internal) ────────────────────────────────────────────────
CREATE TABLE internal.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    user_id UUID REFERENCES public.users (id),
    device_id UUID REFERENCES public.devices (id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    severity TEXT NOT NULL DEFAULT 'INFO' CHECK (
        severity IN ('INFO', 'WARNING', 'ERROR')
    ),
    ip_address INET,
    user_agent TEXT,
    organization_id UUID REFERENCES organization.organizations (id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX idx_audit_logs_user_time ON internal.audit_logs (user_id, timestamp DESC);

CREATE INDEX idx_audit_logs_org_time ON internal.audit_logs (
    organization_id,
    timestamp DESC
);

CREATE INDEX idx_audit_logs_action ON internal.audit_logs (action, timestamp DESC);

-- ─── ML Model Registry (internal) ────────────────────────────────────────────
CREATE TABLE internal.models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT,
    threshold NUMERIC(10, 8) NOT NULL DEFAULT 0.75,
    detector_type TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES public.users (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    UNIQUE (
        organization_id,
        model_id,
        version
    )
);

CREATE INDEX idx_models_org ON internal.models (organization_id);

CREATE INDEX idx_models_active ON internal.models (organization_id, is_active);

-- ─── Notifications (public) ────────────────────────────────────────────────
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity alert_severity NOT NULL DEFAULT 'low',
    category TEXT NOT NULL DEFAULT 'alert',
    read BOOLEAN NOT NULL DEFAULT FALSE,
    alert_id UUID REFERENCES public.alerts (id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX idx_notifications_user ON public.notifications (
    user_id,
    read,
    created_at DESC
);

CREATE INDEX idx_notifications_org ON public.notifications (
    organization_id,
    created_at DESC
);

-- ─── Device Config (devices) ──────────────────────────────────────────────
CREATE TABLE devices.config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    device_id UUID REFERENCES public.devices (id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_by UUID REFERENCES public.users (id),
    organization_id UUID NOT NULL REFERENCES organization.organizations (id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    version INTEGER NOT NULL DEFAULT 1,
    UNIQUE (
        organization_id,
        device_id,
        key
    )
);

CREATE INDEX idx_config_org ON devices.config (organization_id);

CREATE INDEX idx_config_updated_by ON devices.config (updated_by);

-- ─── Retention purge composite indexes ─────────────────────────────────────────
CREATE INDEX idx_events_org_collected ON telemetry.events (organization_id, collected_at);

CREATE INDEX idx_asc_org_scored ON telemetry.anomaly_scores (organization_id, scored_at);

CREATE INDEX idx_fv_org_computed ON telemetry.feature_vectors (organization_id, computed_at);
-- ─── BRIN indexes (append-only time-series) ───────────────────────────────────
CREATE INDEX idx_events_received_brin ON telemetry.events USING BRIN (received_at)
WITH (pages_per_range = 32);

CREATE INDEX idx_asc_scored_at_brin ON telemetry.anomaly_scores USING BRIN (scored_at)
WITH (pages_per_range = 32);

CREATE INDEX idx_fv_computed_at_brin ON telemetry.feature_vectors USING BRIN (computed_at)
WITH (pages_per_range = 32);

CREATE INDEX idx_alerts_created_brin ON public.alerts USING BRIN (created_at)
WITH (pages_per_range = 32);

-- ─── Partial indexes (frequent query filters) ─────────────────────────────────
CREATE INDEX idx_alerts_org_pending_active ON public.alerts (
    organization_id,
    created_at DESC
)
WHERE
    status = 'PENDING'
    AND read = FALSE;

CREATE INDEX idx_alerts_org_unread ON public.alerts (
    organization_id,
    created_at DESC
)
WHERE
    read = FALSE;

-- ─── Trigger functions ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- Sync active organization_id into auth.users raw_app_meta_data for JWT claims
CREATE OR REPLACE FUNCTION internal.sync_organization_to_jwt()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE auth.users
    SET raw_app_meta_data =
        COALESCE(raw_app_meta_data, '{}'::jsonb) ||
        jsonb_build_object('organization_id', NEW.organization_id::TEXT)
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_sync_organization_to_jwt
    AFTER INSERT OR UPDATE OF organization_id ON organization.profiles
    FOR EACH ROW EXECUTE FUNCTION internal.sync_organization_to_jwt();

-- ─── updated_at triggers ────────────────────────────────────────────────────────

CREATE TRIGGER tr_organizations_updated
    BEFORE UPDATE ON organization.organizations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_billing_updated
    BEFORE UPDATE ON organization.billing
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_profiles_updated
    BEFORE UPDATE ON organization.profiles
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

-- ─── Monthly Partition Auto-Creation ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION internal.create_monthly_partition()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_next_month      DATE;
    v_partition_name  TEXT;
    v_start_date      TEXT;
    v_end_date        TEXT;
BEGIN
    v_next_month := date_trunc('month', NOW() + INTERVAL '1 month')::DATE;
    v_start_date := to_char(v_next_month, 'YYYY-MM-DD"T"00:00:00');
    v_end_date   := to_char(v_next_month + INTERVAL '1 month', 'YYYY-MM-DD"T"00:00:00');

    -- anomaly_scores
    v_partition_name := 'anomaly_scores_' || to_char(v_next_month, 'YYYY_MM');
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = v_partition_name) THEN
        EXECUTE format(
            'CREATE TABLE telemetry.%I PARTITION OF telemetry.anomaly_scores FOR VALUES FROM (%L) TO (%L)',
            v_partition_name, v_start_date, v_end_date
        );
    END IF;

    -- device_health
    v_partition_name := 'device_health_' || to_char(v_next_month, 'YYYY_MM');
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = v_partition_name) THEN
        EXECUTE format(
            'CREATE TABLE telemetry.%I PARTITION OF telemetry.device_health FOR VALUES FROM (%L) TO (%L)',
            v_partition_name, v_start_date, v_end_date
        );
    END IF;
END;
$$;

-- ─── Retention Purge RPC ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION internal.purge_table_data(
    p_schema TEXT,
    p_table TEXT,
    p_column TEXT,
    p_cutoff TIMESTAMPTZ,
    p_org_id UUID,
    p_device_id UUID DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
    v_sql TEXT;
BEGIN
    v_sql := format(
        'DELETE FROM %I.%I WHERE %I < $1 AND organization_id = $2',
        p_schema, p_table, p_column
    );

    IF p_device_id IS NOT NULL THEN
        v_sql := v_sql || ' AND device_id = $3';
        EXECUTE v_sql USING p_cutoff, p_org_id, p_device_id;
    ELSE
        EXECUTE v_sql USING p_cutoff, p_org_id;
    END IF;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;