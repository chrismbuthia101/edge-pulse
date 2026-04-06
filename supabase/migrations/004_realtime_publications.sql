-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 004_realtime_publications
-- Description: Enable Supabase Realtime for subscribed tables
-- ============================================================

-- Only expose realtime for tables the client actually subscribes to.
-- alert_records  → AlertRepository.subscribeToAlerts
-- device_registry → DeviceRepository.subscribeToDeviceUpdates
-- incident_cases  → CaseRepository.subscribeToCases
-- sync_queue      → SyncQueueRepository.subscribeToSyncQueue
-- telemetry_events → LiveRepository.subscribeToLiveFeed
ALTER PUBLICATION supabase_realtime ADD TABLE alert_records;
ALTER PUBLICATION supabase_realtime ADD TABLE device_registry;
ALTER PUBLICATION supabase_realtime ADD TABLE incident_cases;
ALTER PUBLICATION supabase_realtime ADD TABLE sync_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE telemetry_events;