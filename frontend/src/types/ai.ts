/**
 * TypeScript contracts for Phase 5 AI Intelligence Engine and Deterministic Safety.
 */

export type ActivityContext =
  | 'GENERAL'
  | 'OUTDOOR_EXERCISE'
  | 'COMMUTE'
  | 'VENTILATION'
  | 'SENSITIVE_POPULATION';

export type AIGenerationStatus =
  | 'GENERATED'
  | 'FALLBACK_NO_API_KEY'
  | 'FALLBACK_INVALID_DATA'
  | 'FALLBACK_STALE_DATA'
  | 'FALLBACK_MODEL_ERROR'
  | 'FALLBACK_VALIDATION_ERROR'
  | 'SIMULATED_DEMO_INSIGHT';

export type ActionCategory =
  | 'VENTILATION'
  | 'OUTDOOR_ACTIVITY'
  | 'PERSONAL_PROTECTION'
  | 'INDOOR_AIR'
  | 'COMMUTE';

export type ActionPriority = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface EnvironmentalEvidenceItem {
  evidence_id: string;
  parameter: string;
  value: string;
  unit?: string | null;
  classification: string;
  freshness: string;
  context_note: string;
}

export interface AIInsightAction {
  action_id: string;
  category: ActionCategory;
  priority: ActionPriority;
  title: string;
  rationale: string;
  evidence_ids: string[];
}

export interface AIInsightResponse {
  location: {
    latitude: number;
    longitude: number;
    name?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  };
  activity_context: ActivityContext;
  status: AIGenerationStatus;
  model_id?: string | null;
  prompt_version: string;
  generated_at: string;
  summary: string;
  explanation: string;
  supporting_factors: string[];
  recommended_actions: AIInsightAction[];
  evidence_context: Record<string, EnvironmentalEvidenceItem>;
  source_classification: string;
  quality_status: string;
  retrieval_freshness: string;
  limitations: string[];
  fallback_reason?: string | null;
}
