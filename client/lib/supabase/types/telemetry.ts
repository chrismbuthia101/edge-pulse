import { TelemetrySource, ConnectivityState } from '@/lib/supabase/types/shared';

export interface TelemetryEvent {
  id: string;
  device_id: string;
  collected_at: string;
  received_at: string | null;
  source: TelemetrySource;
  payload: Record<string, unknown>;
  collection_agent_version: string;
  connectivity_state: ConnectivityState;
}

export interface FeatureVector {
  id: string;
  telemetry_event_id: string;
  device_id: string;
  computed_at: string;
  model_id: string;
  features: Record<string, number>; // named feature → float value
  feature_version: string;          // feature schema version
}

export interface AnomalyScore {
  id: string;
  feature_vector_id: string;
  device_id: string;
  scored_at: string;
  model_id: string;
  score: number;
  threshold_applied: number;
  inference_latency_ms: number;
  above_threshold: boolean;
  connectivity_state: ConnectivityState;
}
