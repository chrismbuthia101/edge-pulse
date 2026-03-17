import { AlertSeverity, AlertStatus, TelemetrySource } from '@/lib/supabase/types/shared';

export interface Alert {
  id: string;
  device_id: string;
  device_name: string;
  telemetry_event_id: string;
  feature_vector_id: string;
  anomaly_score_id: string;

  // Detection metadata
  anomaly_score: number;
  model_id: string;
  collection_agent_version: string;
  inference_latency_ms: number;
  telemetry_source: TelemetrySource;

  // Alert details
  title: string;
  description: string | null;
  severity: AlertSeverity;
  category: string;               // e.g. "Malware", "Network", "Auth"
  confidence: number;

  // Detection window
  detection_window_start: string;
  detection_window_end: string;
  detection_window_minutes: number; // e.g. 5

  // SHAP explainability
  explanation_json: ShapExplanation | null;

  // Network-specific fields (populated when source === 'NETWORK')
  net_destination_ip: string | null;
  net_destination_port: number | null;
  net_protocol: string | null;
  net_duration_ms: number | null;

  // Process-specific fields (populated when source === 'PROCESS')
  proc_name: string | null;
  proc_privilege_level: 'user' | 'admin' | 'system' | null;
  proc_pid: number | null;

  // Lifecycle
  status: AlertStatus;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null; // user id
  investigated_at: string | null;
  investigated_by: string | null;
  closed_at: string | null;
  closed_by: string | null;

  // Extra UI helpers
  read: boolean;
}

// SHAP explanation stored per alert
export interface ShapExplanation {
  base_score: number;
  final_score: number;
  features: ShapFeature[];
}

export interface ShapFeature {
  label: string;
  value: number;    // raw SHAP value (signed float)
  positive: boolean; // true = pushes score up (increases anomaly risk)
  description?: string;
}
