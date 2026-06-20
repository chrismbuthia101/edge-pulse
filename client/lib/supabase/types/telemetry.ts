import type { ConnectivityState } from "@/lib/supabase/types/shared";

export type FeatureType =
  | "statistical"
  | "temporal"
  | "frequency_domain"
  | "custom";

export interface TelemetryEvent {
  id: string;
  device_id: string;
  event_id: string | null;
  feature_name: string;
  feature_type: FeatureType;
  value: number;
  metadata: Record<string, unknown> | null;
  source: string | null;
  session_id: string | null;
  payload: Record<string, unknown>;
  collected_at: string;
  organization_id: string;
  created_at: string;
  received_at: string;
  integrity_hash: string | null;
}

export interface FeatureVector {
  id: string;
  event_id: string | null;
  device_id: string;
  computed_at: string;
  model_id: string;
  features: Record<string, number>;
  feature_version: string;
  organization_id: string;
  integrity_hash: string | null;
}

export interface AnomalyScore {
  id: string;
  feature_vector_id: string | null;
  device_id: string;
  model_id: string;
  score: number;
  label: string | null;
  threshold_applied: number;
  above_threshold: boolean;
  inference_latency_ms: number;
  connectivity_state: ConnectivityState;
  organization_id: string;
  integrity_hash: string | null;
  created_at: string;
  scored_at: string;
}
