import type { AlertSeverity, AlertStatus, TelemetrySource } from '@/lib/supabase/types/shared';

export interface ShapFeature {
  feature_name: string;
  feature_value: number;
  attribution_score: number;
  contribution_type: 'positive' | 'negative' | 'neutral';
  rank: number;
  normalised_attribution?: number;
}

export interface ShapExplanation {
  version?: string;
  explanation_type?: string;
  model_id?: string;
  timestamp?: string;
  anomaly_score?: number;
  base_score: number;
  final_score: number;
  detection_threshold?: number;
  is_anomaly?: boolean;
  features: ShapFeature[];
  summary: {
    confidence_level: number;
    main_factors: string[];
    processing_time_ms: number;
    explanation_type?: string;
    top_positive_factors?: string[];
    top_negative_factors?: string[];
  };
  metadata?: Record<string, unknown>;
}

export interface Alert {
  id: string;
  alert_id: string;
  device_id: string;
  device_name: string;
  telemetry_event_id?: string;
  feature_vector_id?: string;
  anomaly_score_id?: string;
  // detection metadata
  anomaly_score: number;
  model_id: string;
  collection_agent_version: string;
  inference_latency_ms: number;
  telemetry_source: TelemetrySource;
  alert_type: string;
  detector_type: string;
  // display
  title: string;
  description: string | null;
  severity: AlertSeverity;
  category: string;
  confidence: number;
  // detection window
  detection_window_start: string | null;
  detection_window_end: string | null;
  detection_window_minutes: number | null;
  // SHAP
  explanation_json: ShapExplanation | null;
  // network-specific
  net_destination_ip: string | null;
  net_destination_port: number | null;
  net_protocol: string | null;
  net_duration_ms: number | null;
  // process-specific
  proc_name: string | null;
  proc_privilege_level: 'user' | 'admin' | 'system' | null;
  proc_pid: number | null;
  // lifecycle
  status: AlertStatus;
  read: boolean;
  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  investigated_at: string | null;
  investigated_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
}