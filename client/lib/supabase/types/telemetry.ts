import { TelemetrySource, ConnectivityState } from '@/lib/supabase/types/shared';

export interface TelemetryEvent {
  id: string;
  device_id: string;
  device_name?: string;
  collected_at: string;
  received_at: string | null;
  source: TelemetrySource;
  payload: Record<string, unknown>;
  collection_agent_version: string;
  connectivity_state: ConnectivityState;
  payload_hash: string;
  created_at: string;
}

export interface FeatureVector {
  id: string;
  telemetry_event_id: string;
  device_id: string;
  computed_at: string;
  model_id: string;
  features: Record<string, number>;
  feature_version: string;
}

export interface AnomalyScore {
  id: string;
  feature_vector_id: string | null;
  device_id: string;
  model_id: string;
  score: number;
  label?: string;
  threshold_applied: number;
  above_threshold: boolean;
  inference_latency_ms: number;
  connectivity_state: ConnectivityState;
  created_at: string;
  scored_at: string;
}