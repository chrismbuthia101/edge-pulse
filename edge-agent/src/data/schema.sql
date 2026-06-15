-- edge-agent local SQLite schema
-- Version: 2.1.0

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ─── Canonical telemetry events ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telemetry_events (
    event_id                    TEXT    PRIMARY KEY,
    device_id                   TEXT    NOT NULL,
    timestamp                   TEXT    NOT NULL,
    event_type                  TEXT    NOT NULL
                                CHECK (event_type IN ('PROCESS', 'NETWORK', 'FILE', 'RESOURCE')),
    event_payload               TEXT    NOT NULL,
    collection_agent_version    TEXT    NOT NULL,
    payload_hash                TEXT    NOT NULL,
    synced                      INTEGER DEFAULT 0,
    created_at                  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_device ON telemetry_events(device_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_ts     ON telemetry_events(timestamp DESC);

-- ─── Device registry ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
    id              TEXT    PRIMARY KEY,
    last_seen       TEXT    NOT NULL,
    status          TEXT    NOT NULL
                    CHECK (status IN ('online', 'offline', 'warning', 'error')),
    cpu_usage       DECIMAL(5,2),
    memory_usage    DECIMAL(5,2),
    alerts_count    INTEGER DEFAULT 0,
    version         TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_devices_id        ON devices(id);
CREATE INDEX IF NOT EXISTS idx_devices_status    ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen DESC);

-- ─── Alerts ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id                TEXT    UNIQUE NOT NULL,
    timestamp               TEXT    NOT NULL,
    device_id               TEXT    NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    severity                TEXT    NOT NULL
                            CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    anomaly_score           DECIMAL(10,6) NOT NULL,
    alert_type              TEXT    NOT NULL,
    detector_type           TEXT    NOT NULL,
    explanation_summary     TEXT,
    feature_importance      TEXT,
    data_json               TEXT,
    acknowledged            BOOLEAN DEFAULT FALSE,
    acknowledged_at         TEXT,
    acknowledged_by         TEXT,
    synced                  INTEGER DEFAULT 0,
    created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_alerts_device_id          ON alerts(device_id);
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp           ON alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity            ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_synced              ON alerts(synced);
CREATE INDEX IF NOT EXISTS idx_alerts_alert_id            ON alerts(alert_id);
CREATE INDEX IF NOT EXISTS idx_alerts_device_timestamp    ON alerts(device_id, timestamp DESC);

-- ─── Telemetry (summary) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telemetry (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id               TEXT    NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    timestamp               TEXT    NOT NULL,
    cpu_percent             DECIMAL(5,2),
    memory_percent          DECIMAL(5,2),
    disk_usage              DECIMAL(5,2),
    process_count           INTEGER,
    network_connections     INTEGER,
    metrics_json            TEXT,
    created_at              DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_id          ON telemetry(device_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp           ON telemetry(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_timestamp    ON telemetry(device_id, timestamp DESC);

-- ─── Detections ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS detections (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id           TEXT    NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    timestamp           TEXT    NOT NULL,
    detector_name       TEXT    NOT NULL,
    label               INTEGER NOT NULL CHECK (label IN (0, 1)),
    anomaly_score       DECIMAL(10,6),
    confidence          DECIMAL(10,6),
    features_used       TEXT,
    model_version       TEXT,
    detection_metadata  TEXT,
    synced              INTEGER DEFAULT 0,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_detections_device_id          ON detections(device_id);
CREATE INDEX IF NOT EXISTS idx_detections_timestamp           ON detections(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_detections_detector            ON detections(detector_name);
CREATE INDEX IF NOT EXISTS idx_detections_device_timestamp    ON detections(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_detections_synced              ON detections(synced);

-- ─── Features ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS features (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id           TEXT    NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    timestamp           TEXT    NOT NULL,
    features_json       TEXT    NOT NULL,
    feature_names       TEXT    NOT NULL,
    model_version       TEXT,
    normalized          BOOLEAN DEFAULT FALSE,
    source_event_id     TEXT,
    synced              INTEGER DEFAULT 0,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_features_device_id          ON features(device_id);
CREATE INDEX IF NOT EXISTS idx_features_timestamp           ON features(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_features_device_timestamp    ON features(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_features_synced              ON features(synced);

-- ─── Sync queue ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type   TEXT    NOT NULL,
    item_id     TEXT    NOT NULL,
    data_json   TEXT    NOT NULL,
    attempts    INTEGER DEFAULT 0,
    last_attempt TEXT,
    next_retry  TEXT,
    priority    INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_type       ON sync_queue(item_type);
CREATE INDEX IF NOT EXISTS idx_sync_queue_priority    ON sync_queue(priority DESC);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at  ON sync_queue(created_at);

-- ─── System events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT    NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    timestamp   TEXT    NOT NULL,
    event_type  TEXT    NOT NULL,
    component   TEXT    NOT NULL,
    data_json   TEXT    NOT NULL,
    severity    TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_events_device_id          ON events(device_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp           ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_type                ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_device_timestamp    ON events(device_id, timestamp DESC);

-- ─── Triggers ────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS update_devices_updated_at
    AFTER UPDATE ON devices FOR EACH ROW
BEGIN
    UPDATE devices SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_alerts_updated_at
    AFTER UPDATE ON alerts FOR EACH ROW
BEGIN
    UPDATE alerts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_sync_queue_updated_at
    AFTER UPDATE ON sync_queue FOR EACH ROW
BEGIN
    UPDATE sync_queue SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
