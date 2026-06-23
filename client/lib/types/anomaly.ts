import type { ConnectivityState } from "@/lib/types/shared";

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

export interface AnomalyAnalytics {
  deviceId: string;
  currentScore: number;
  baselineScore: number;
  deviation: number;
  trend: "improving" | "stable" | "degrading";
  history: AnomalyScore[];
}

export interface AnomalyTrend {
  direction: "up" | "down" | "stable";
  magnitude: number;
  confidence: number;
}

export interface GetAnomalyScoresOptions {
  deviceId: string;
  limit?: number;
  orderBy?: {
    column: "created_at" | "score";
    ascending?: boolean;
  };
  search?: string;
}
