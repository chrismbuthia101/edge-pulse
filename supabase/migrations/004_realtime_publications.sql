-- Only expose realtime for tables the client actually subscribes to
ALTER PUBLICATION supabase_realtime ADD TABLE alert_records;
ALTER PUBLICATION supabase_realtime ADD TABLE device_registry;
ALTER PUBLICATION supabase_realtime ADD TABLE telemetry_events;
ALTER PUBLICATION supabase_realtime ADD TABLE sync_queue;
-- Do NOT add: agent_api_keys, audit_trail, device_enrollment_tokens