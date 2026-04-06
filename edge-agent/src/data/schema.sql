-- edge-agent local SQLite schema
-- Version: 2.0.0
-- Purpose: offline-first storage, synced to Supabase

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ─── Canonical telemetry events ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telemetry_events (
    event_id        TEXT    PRIMARY KEY,  -- UUID v4
    device_id       TEXT    NOT NULL,
    collected_at    TEXT    NOT NULL,     -- ISO-8601 UTC
    received_at     TEXT,
    source          TEXT    NOT NULL      -- PROCESS | NETWORK | FILE | RESOURCE
                    CHECK (source IN ('PROCESS','NETWORK','FILE','RESOURCE')),
    event_payload   TEXT    NOT NULL,     -- JSON string
    agent_version   TEXT    NOT NULL,
    payload_hash    TEXT    NOT NULL,     -- SHA-256 hex of event_payload
    synced          INTEGER NOT NULL DEFAULT 0,  -- 0=pending, 1=synced
    synced_at       TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_tel_device_collected ON telemetry_events(device_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_tel_synced           ON telemetry_events(synced, collected_at);
CREATE INDEX IF NOT EXISTS idx_tel_source           ON telemetry_events(source);

-- ─── Feature vectors ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_vectors (
    feature_id          TEXT    PRIMARY KEY,
    device_id           TEXT    NOT NULL,
    window_start_utc    TEXT    NOT NULL,
    window_end_utc      TEXT    NOT NULL,
    feature_blob        BLOB    NOT NULL,  -- Float32 array as bytes
    feature_schema_ver  TEXT    NOT NULL DEFAULT 'v1.0',
    source_event_ids    TEXT    NOT NULL,  -- JSON array of event_id strings
    computed_at         TEXT    NOT NULL,
    synced              INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_fv_device_window ON feature_vectors(device_id, window_start_utc DESC);
CREATE INDEX IF NOT EXISTS idx_fv_synced        ON feature_vectors(synced);

-- ─── Anomaly scores ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomaly_scores (
    score_id             TEXT    PRIMARY KEY,
    feature_id           TEXT    NOT NULL REFERENCES feature_vectors(feature_id) ON DELETE CASCADE,
    device_id            TEXT    NOT NULL,
    model_id             TEXT    NOT NULL,
    score                REAL    NOT NULL CHECK (score >= 0 AND score <= 1),
    threshold_applied    REAL    NOT NULL,
    above_threshold      INTEGER NOT NULL CHECK (above_threshold IN (0,1)),
    inference_latency_ms INTEGER NOT NULL CHECK (inference_latency_ms >= 0),
    scored_at            TEXT    NOT NULL,
    synced               INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_as_device_scored ON anomaly_scores(device_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_as_threshold     ON anomaly_scores(above_threshold, scored_at);
CREATE INDEX IF NOT EXISTS idx_as_synced        ON anomaly_scores(synced);

-- ─── Alert records (local mirror) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_records (
    alert_id                TEXT    PRIMARY KEY,
    score_id                TEXT    NOT NULL REFERENCES anomaly_scores(score_id) ON DELETE CASCADE,
    device_id               TEXT    NOT NULL,
    device_name             TEXT    NOT NULL,
    telemetry_source        TEXT    NOT NULL
                            CHECK (telemetry_source IN ('PROCESS','NETWORK','FILE','RESOURCE')),
    title                   TEXT    NOT NULL,
    description             TEXT,
    severity                TEXT    NOT NULL
                            CHECK (severity IN ('low','medium','high','critical')),
    category                TEXT    NOT NULL DEFAULT 'Unknown',
    anomaly_score           REAL    NOT NULL CHECK (anomaly_score >= 0 AND anomaly_score <= 1),
    confidence              REAL    NOT NULL DEFAULT 0,
    model_id                TEXT    NOT NULL,
    agent_version           TEXT    NOT NULL,
    inference_latency_ms    INTEGER NOT NULL DEFAULT 0,
    explanation_json        TEXT    NOT NULL DEFAULT '{}',  -- SHAP JSON
    status                  TEXT    NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','ACKNOWLEDGED','INVESTIGATED','CLOSED')),
    -- network fields
    net_destination_ip      TEXT,
    net_destination_port    INTEGER,
    net_protocol            TEXT,
    net_duration_ms         INTEGER,
    -- process fields
    proc_name               TEXT,
    proc_privilege_level    TEXT    CHECK (proc_privilege_level IN ('user','admin','system') OR proc_privilege_level IS NULL),
    proc_pid                INTEGER,
    -- lifecycle
    acknowledged_at         TEXT,
    acknowledged_by         TEXT,
    investigated_at         TEXT,
    investigated_by         TEXT,
    closed_at               TEXT,
    closed_by               TEXT,
    read                    INTEGER NOT NULL DEFAULT 0,
    synced                  INTEGER NOT NULL DEFAULT 0,
    synced_at               TEXT,
    created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ar_device_created ON alert_records(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_severity       ON alert_records(severity, status);
CREATE INDEX IF NOT EXISTS idx_ar_status         ON alert_records(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ar_synced         ON alert_records(synced);

-- ─── Tamper-evident log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tamper_evident_log (
    log_id                  TEXT    PRIMARY KEY,
    device_id               TEXT    NOT NULL,
    log_sequence_number     INTEGER NOT NULL,
    log_entry_type          TEXT    NOT NULL,  -- TELEMETRY | ALERT | DETECTION | SYNC | SYSTEM
    log_entry_reference_id  TEXT,
    entry_timestamp_utc     TEXT    NOT NULL,
    entry_content_hash      TEXT    NOT NULL,  -- SHA-256
    previous_entry_hash     TEXT    NOT NULL,  -- SHA-256 of prior entry
    digital_signature       TEXT,
    synced                  INTEGER NOT NULL DEFAULT 0,
    created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(device_id, log_sequence_number)
);
CREATE INDEX IF NOT EXISTS idx_tel_device_seq  ON tamper_evident_log(device_id, log_sequence_number);
CREATE INDEX IF NOT EXISTS idx_tel_hash        ON tamper_evident_log(entry_content_hash);
CREATE INDEX IF NOT EXISTS idx_tel_prev_hash   ON tamper_evident_log(previous_entry_hash);
CREATE INDEX IF NOT EXISTS idx_tel_synced_log  ON tamper_evident_log(synced);

-- ─── Sync queue ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_queue (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id           TEXT    NOT NULL,
    record_type         TEXT    NOT NULL,  -- telemetry_events | alert_records | feature_vectors | anomaly_scores | tamper_evident_log
    record_id           TEXT    NOT NULL,
    payload_json        TEXT    NOT NULL,
    priority            INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    attempts            INTEGER NOT NULL DEFAULT 0,
    max_attempts        INTEGER NOT NULL DEFAULT 5,
    status              TEXT    NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','SYNCING','COMPLETED','FAILED')),
    last_attempt_at     TEXT,
    next_retry_at       TEXT,
    last_error          TEXT,
    queued_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    completed_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_sq_status_priority ON sync_queue(status, priority DESC, queued_at);
CREATE INDEX IF NOT EXISTS idx_sq_record          ON sync_queue(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_sq_retry           ON sync_queue(next_retry_at) WHERE status='PENDING';

-- ─── Local device record ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_info (
    device_id           TEXT    PRIMARY KEY,
    hostname            TEXT    NOT NULL,
    os                  TEXT    NOT NULL,
    agent_version       TEXT    NOT NULL,
    enrolled_at         TEXT    NOT NULL,
    last_seen_at        TEXT    NOT NULL,
    is_active           INTEGER NOT NULL DEFAULT 1,
    api_key_hash        TEXT    NOT NULL,  -- SHA-256 of current API key
    config_json         TEXT    NOT NULL DEFAULT '{}',
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── Agent configuration (local) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_config (
    key         TEXT    PRIMARY KEY,
    value       TEXT    NOT NULL,
    source      TEXT    NOT NULL DEFAULT 'local',  -- local | remote
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    version     INTEGER NOT NULL DEFAULT 1
);

-- ─── Events (system log) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT    NOT NULL,
    event_type  TEXT    NOT NULL,
    component   TEXT    NOT NULL,
    data_json   TEXT    NOT NULL DEFAULT '{}',
    severity    TEXT    CHECK (severity IN ('low','medium','high','critical') OR severity IS NULL),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_se_created ON system_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_type    ON system_events(event_type);

-- ─── Triggers ─────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS alert_updated_at
    AFTER UPDATE ON alert_records FOR EACH ROW
BEGIN
    UPDATE alert_records SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE alert_id = NEW.alert_id;
END;