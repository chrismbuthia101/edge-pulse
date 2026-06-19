import type {
  AlertSeverity,
  AlertStatus,
  TelemetrySource,
  PrivilegeLevel,
} from "@/lib/supabase/types/shared";

export interface ShapFeature {
  feature_name: string;
  feature_value: number;
  attribution_score: number;
  contribution_type: "positive" | "negative" | "neutral";
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
  device_id: string;
  parent_alert_id: string | null;
  event_id: string | null;
  feature_vector_id: string | null;
  anomaly_score_id: string | null;
  anomaly_score: number;
  model_id: string;
  inference_latency_ms: number;
  telemetry_source: TelemetrySource;
  title: string;
  description: string | null;
  severity: AlertSeverity;
  category: string;
  confidence: number;
  alert_type: string | null;
  detector_type: string | null;
  detection_window_start: string | null;
  detection_window_end: string | null;
  explanation_json: ShapExplanation | null;
  tags: string[] | null;
  source_ip: string | null;
  mitre_technique_id: string | null;
  net_destination_ip: string | null;
  net_destination_port: number | null;
  net_protocol: string | null;
  net_duration_ms: number | null;
  proc_name: string | null;
  proc_privilege_level: PrivilegeLevel | null;
  proc_pid: number | null;
  status: AlertStatus;
  read: boolean;
  organization_id: string;
  integrity_hash: string | null;
  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  investigated_at: string | null;
  investigated_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
}
