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