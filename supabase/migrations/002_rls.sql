-- EdgePulse Row Level Security Policies
-- Dual authentication: JWT for humans, API keys for devices

-- Enable RLS on all tables
ALTER TABLE analyst_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_enrollment_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tamper_evident_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE synchronization_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyst_device_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;

-- Helper functions for authentication

-- Function to validate device API key
CREATE OR REPLACE FUNCTION validate_device_api_key(p_device_id UUID, p_api_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    key_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM agent_api_keys 
        WHERE device_id = p_device_id 
        AND key_hash = crypt(p_api_key, key_hash)
        AND is_active = TRUE
        AND (expires_at IS NULL OR expires_at > NOW())
    ) INTO key_exists;
    
    RETURN key_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current user type
CREATE OR REPLACE FUNCTION get_current_user_type()
RETURNS TEXT AS $$
DECLARE
    user_type TEXT;
BEGIN
    -- Check if authenticated as Supabase user (human analyst)
    IF auth.uid() IS NOT NULL THEN
        RETURN 'human';
    END IF;
    
    -- Check if authenticated via API key (device agent)
    IF current_setting('request.headers', true) LIKE '%X-EdgePulse-Device-Id%' 
       AND current_setting('request.headers', true) LIKE '%X-EdgePulse-Api-Key%' THEN
        RETURN 'device';
    END IF;
    
    RETURN 'anonymous';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current device ID from headers
CREATE OR REPLACE FUNCTION get_current_device_id()
RETURNS UUID AS $$
DECLARE
    device_id_text TEXT;
    device_id UUID;
BEGIN
    -- Extract device ID from headers
    device_id_text := current_setting('request.headers', true);
    device_id_text := substring(device_id_text from 'X-EdgePulse-Device-Id: ([^,]+)');
    
    -- Validate UUID format
    BEGIN
        device_id := device_id_text::UUID;
        RETURN device_id;
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current API key from headers
CREATE OR REPLACE FUNCTION get_current_api_key()
RETURNS TEXT AS $$
DECLARE
    api_key TEXT;
BEGIN
    -- Extract API key from headers
    api_key := current_setting('request.headers', true);
    api_key := substring(api_key from 'X-EdgePulse-Api-Key: ([^,]+)');
    
    RETURN api_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies

-- 1. analyst_users
-- Users can see their own profile, admins can see all
CREATE POLICY "Users can view own profile" ON analyst_users FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all users" ON analyst_users FOR SELECT USING (
    EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
);
CREATE POLICY "Admins can update users" ON analyst_users FOR UPDATE USING (
    EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
);
CREATE POLICY "Admins can insert users" ON analyst_users FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
);

-- 2. device_registry
-- Devices can only see their own record
CREATE POLICY "Devices can view own registry" ON device_registry FOR SELECT USING (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Analysts can view devices they're assigned to
CREATE POLICY "Analysts can view assigned devices" ON device_registry FOR SELECT USING (
    get_current_user_type() = 'human'
    AND auth.uid() IS NOT NULL
    AND (
        EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
        OR EXISTS (
            SELECT 1 FROM analyst_device_assignments 
            WHERE analyst_id = auth.uid() 
            AND device_id = device_registry.device_id 
            AND is_active = TRUE
        )
    )
);
-- Devices can update their own last_seen
CREATE POLICY "Devices can update own registry" ON device_registry FOR UPDATE USING (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);

-- 3. agent_api_keys
-- Devices can view their own API keys
CREATE POLICY "Devices can view own API keys" ON agent_api_keys FOR SELECT USING (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Admins can view all API keys
CREATE POLICY "Admins can view all API keys" ON agent_api_keys FOR SELECT USING (
    get_current_user_type() = 'human'
    AND EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
);
-- Admins can manage API keys
CREATE POLICY "Admins can manage API keys" ON agent_api_keys FOR ALL USING (
    get_current_user_type() = 'human'
    AND EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
);

-- 4. device_enrollment_tokens
-- Admins can manage enrollment tokens
CREATE POLICY "Admins can manage enrollment tokens" ON device_enrollment_tokens FOR ALL USING (
    get_current_user_type() = 'human'
    AND EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
);

-- 5. agent_config
-- Devices can view their own config
CREATE POLICY "Devices can view own config" ON agent_config FOR SELECT USING (
    get_current_user_type() = 'device' 
    AND (device_id = get_current_device_id() OR device_id IS NULL) -- Allow global config
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Admins can manage all config
CREATE POLICY "Admins can manage config" ON agent_config FOR ALL USING (
    get_current_user_type() = 'human'
    AND EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
);

-- 6. telemetry_events
-- Devices can only insert their own telemetry
CREATE POLICY "Devices can insert own telemetry" ON telemetry_events FOR INSERT WITH CHECK (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Devices can view their own telemetry
CREATE POLICY "Devices can view own telemetry" ON telemetry_events FOR SELECT USING (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Analysts can view telemetry from assigned devices
CREATE POLICY "Analysts can view assigned telemetry" ON telemetry_events FOR SELECT USING (
    get_current_user_type() = 'human'
    AND auth.uid() IS NOT NULL
    AND (
        EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
        OR EXISTS (
            SELECT 1 FROM analyst_device_assignments 
            WHERE analyst_id = auth.uid() 
            AND device_id = telemetry_events.device_id 
            AND is_active = TRUE
        )
    )
);

-- 7. feature_vectors
-- Devices can only insert their own features
CREATE POLICY "Devices can insert own features" ON feature_vectors FOR INSERT WITH CHECK (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Devices can view their own features
CREATE POLICY "Devices can view own features" ON feature_vectors FOR SELECT USING (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Analysts can view features from assigned devices
CREATE POLICY "Analysts can view assigned features" ON feature_vectors FOR SELECT USING (
    get_current_user_type() = 'human'
    AND auth.uid() IS NOT NULL
    AND (
        EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
        OR EXISTS (
            SELECT 1 FROM analyst_device_assignments 
            WHERE analyst_id = auth.uid() 
            AND device_id = feature_vectors.device_id 
            AND is_active = TRUE
        )
    )
);

-- 8. anomaly_scores
-- Devices can only insert their own scores
CREATE POLICY "Devices can insert own scores" ON anomaly_scores FOR INSERT WITH CHECK (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Devices can view their own scores
CREATE POLICY "Devices can view own scores" ON anomaly_scores FOR SELECT USING (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Analysts can view scores from assigned devices
CREATE POLICY "Analysts can view assigned scores" ON anomaly_scores FOR SELECT USING (
    get_current_user_type() = 'human'
    AND auth.uid() IS NOT NULL
    AND (
        EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
        OR EXISTS (
            SELECT 1 FROM analyst_device_assignments 
            WHERE analyst_id = auth.uid() 
            AND device_id = anomaly_scores.device_id 
            AND is_active = TRUE
        )
    )
);

-- 9. alert_records
-- Devices can only insert their own alerts
CREATE POLICY "Devices can insert own alerts" ON alert_records FOR INSERT WITH CHECK (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Devices can view their own alerts
CREATE POLICY "Devices can view own alerts" ON alert_records FOR SELECT USING (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Analysts can view alerts from assigned devices
CREATE POLICY "Analysts can view assigned alerts" ON alert_records FOR SELECT USING (
    get_current_user_type() = 'human'
    AND auth.uid() IS NOT NULL
    AND (
        EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
        OR EXISTS (
            SELECT 1 FROM analyst_device_assignments 
            WHERE analyst_id = auth.uid() 
            AND device_id = alert_records.device_id 
            AND is_active = TRUE
        )
    )
);
-- Analysts can update alerts from assigned devices
CREATE POLICY "Analysts can update assigned alerts" ON alert_records FOR UPDATE USING (
    get_current_user_type() = 'human'
    AND auth.uid() IS NOT NULL
    AND (
        EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
        OR EXISTS (
            SELECT 1 FROM analyst_device_assignments 
            WHERE analyst_id = auth.uid() 
            AND device_id = alert_records.device_id 
            AND is_active = TRUE
        )
    )
);

-- 10. tamper_evident_log
-- Devices can only insert their own log entries
CREATE POLICY "Devices can insert own tamper log" ON tamper_evident_log FOR INSERT WITH CHECK (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Devices can view their own log entries
CREATE POLICY "Devices can view own tamper log" ON tamper_evident_log FOR SELECT USING (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Admins can view all tamper logs
CREATE POLICY "Admins can view all tamper logs" ON tamper_evident_log FOR SELECT USING (
    get_current_user_type() = 'human'
    AND EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
);

-- 11. synchronization_queue
-- Devices can only manage their own queue entries
CREATE POLICY "Devices can manage own sync queue" ON synchronization_queue FOR ALL USING (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Admins can view all sync queues
CREATE POLICY "Admins can view all sync queues" ON synchronization_queue FOR SELECT USING (
    get_current_user_type() = 'human'
    AND EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
);

-- 12. device_health_snapshots
-- Devices can only insert their own health snapshots
CREATE POLICY "Devices can insert own health snapshots" ON device_health_snapshots FOR INSERT WITH CHECK (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Devices can view their own health snapshots
CREATE POLICY "Devices can view own health snapshots" ON device_health_snapshots FOR SELECT USING (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);
-- Analysts can view health from assigned devices
CREATE POLICY "Analysts can view assigned health" ON device_health_snapshots FOR SELECT USING (
    get_current_user_type() = 'human'
    AND auth.uid() IS NOT NULL
    AND (
        EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
        OR EXISTS (
            SELECT 1 FROM analyst_device_assignments 
            WHERE analyst_id = auth.uid() 
            AND device_id = device_health_snapshots.device_id 
            AND is_active = TRUE
        )
    )
);

-- 13. analyst_device_assignments
-- Admins can manage assignments
CREATE POLICY "Admins can manage assignments" ON analyst_device_assignments FOR ALL USING (
    get_current_user_type() = 'human'
    AND EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
);
-- Users can view their own assignments
CREATE POLICY "Users can view own assignments" ON analyst_device_assignments FOR SELECT USING (
    get_current_user_type() = 'human'
    AND auth.uid() IS NOT NULL
    AND analyst_id = auth.uid()
);

-- 14. incident_cases
-- Admins can manage all cases
CREATE POLICY "Admins can manage all cases" ON incident_cases FOR ALL USING (
    get_current_user_type() = 'human'
    AND EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
);
-- Users can view cases they're assigned to
CREATE POLICY "Users can view assigned cases" ON incident_cases FOR SELECT USING (
    get_current_user_type() = 'human'
    AND auth.uid() IS NOT NULL
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
);
-- Users can update cases they're assigned to
CREATE POLICY "Users can update assigned cases" ON incident_cases FOR UPDATE USING (
    get_current_user_type() = 'human'
    AND auth.uid() IS NOT NULL
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
);

-- 15. case_alerts
-- Users can manage alerts for their cases
CREATE POLICY "Users can manage case alerts" ON case_alerts FOR ALL USING (
    get_current_user_type() = 'human'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM incident_cases 
        WHERE case_id = case_alerts.case_id 
        AND (created_by = auth.uid() OR assigned_to = auth.uid())
    )
);

-- 16. audit_trail
-- Read-only for most users
CREATE POLICY "Users can view audit trail" ON audit_trail FOR SELECT USING (
    get_current_user_type() = 'human'
    AND auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND is_active = TRUE)
);
-- Devices can view their own audit entries
CREATE POLICY "Devices can view own audit trail" ON audit_trail FOR SELECT USING (
    get_current_user_type() = 'device' 
    AND device_id = get_current_device_id()
    AND validate_device_api_key(get_current_device_id(), get_current_api_key())
);

-- 17. notification_rules
-- Admins can manage all rules
CREATE POLICY "Admins can manage notification rules" ON notification_rules FOR ALL USING (
    get_current_user_type() = 'human'
    AND EXISTS (SELECT 1 FROM analyst_users WHERE user_id = auth.uid() AND role = 'ADMINISTRATOR')
);
-- Users can view rules they created
CREATE POLICY "Users can view own notification rules" ON notification_rules FOR SELECT USING (
    get_current_user_type() = 'human'
    AND auth.uid() IS NOT NULL
    AND created_by = auth.uid()
);

-- Grant permissions to authenticated users
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
