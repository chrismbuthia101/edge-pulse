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

-- Handle tables that might already be in the publication
DO $$
BEGIN
    -- Try to add each table, ignore if already exists
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE alert_records;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE device_registry;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE incident_cases;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE sync_queue;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE telemetry_events;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;