"""Pydantic schemas for Google Gemini AI Intelligence Engine and Deterministic Safety Rules."""
from enum import Enum
from typing import Optional, List, Dict
from datetime import datetime
from pydantic import BaseModel, Field

from .common import (
    DataClassification,
    FreshnessStatus,
    ForecastValidityStatus,
    QualityStatus,
    LocationMetadata
)


class ActivityContext(str, Enum):
    """User activity context constraining guidance synthesis."""
    GENERAL = "GENERAL"
    OUTDOOR_EXERCISE = "OUTDOOR_EXERCISE"
    COMMUTE = "COMMUTE"
    VENTILATION = "VENTILATION"
    SENSITIVE_POPULATION = "SENSITIVE_POPULATION"


class AIGenerationStatus(str, Enum):
    """Execution status of the AI Intelligence & Deterministic Safety pipeline."""
    GENERATED = "GENERATED"
    FALLBACK_NO_API_KEY = "FALLBACK_NO_API_KEY"
    FALLBACK_INVALID_DATA = "FALLBACK_INVALID_DATA"
    FALLBACK_STALE_DATA = "FALLBACK_STALE_DATA"
    FALLBACK_MODEL_ERROR = "FALLBACK_MODEL_ERROR"
    FALLBACK_VALIDATION_ERROR = "FALLBACK_VALIDATION_ERROR"
    SIMULATED_DEMO_INSIGHT = "SIMULATED_DEMO_INSIGHT"


class ActionCategory(str, Enum):
    """Category classification for recommended environmental mitigation actions."""
    VENTILATION = "VENTILATION"
    OUTDOOR_ACTIVITY = "OUTDOOR_ACTIVITY"
    PERSONAL_PROTECTION = "PERSONAL_PROTECTION"
    INDOOR_AIR = "INDOOR_AIR"
    COMMUTE = "COMMUTE"


class ActionPriority(str, Enum):
    """Priority level for actions based on environmental exposure risk."""
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


class EnvironmentalEvidenceItem(BaseModel):
    """Single discrete telemetry evidence point provided to AI synthesis."""
    evidence_id: str = Field(..., description="Unique deterministic identifier, e.g. EVID-PM25, EVID-DISPERSION")
    parameter: str = Field(..., description="Human-readable parameter name")
    value: str = Field(..., description="Observed or modelled numerical value with precision")
    unit: Optional[str] = Field(None, description="Physical measurement unit (e.g. µg/m³, km/h, meters)")
    classification: DataClassification = Field(..., description="OBSERVATION, MODELLED_FORECAST, or SIMULATED_DEMO")
    freshness: FreshnessStatus = Field(..., description="Temporal freshness of evidence point")
    context_note: str = Field(..., description="Contextual interpretation or scientific caveat")
    timestamp: Optional[datetime] = Field(None, description="Physical measurement or forecast valid timestamp")
    averaging_period: Optional[str] = Field(None, description="Known averaging period (e.g. '1-hour', '8-hour', '24-hour', 'instantaneous')")


class EnvironmentalEvidenceContext(BaseModel):
    """Complete minimal evidence bundle provided to the AI synthesis engine."""
    location: LocationMetadata
    source_type: DataClassification
    quality_status: QualityStatus
    retrieval_freshness: FreshnessStatus
    observation_freshness: Optional[FreshnessStatus] = None
    forecast_validity: Optional[ForecastValidityStatus] = None
    retrieved_at: datetime
    observed_at: Optional[datetime] = None
    forecast_timestamp: Optional[datetime] = None
    # Independent surface meteorology and dispersion provenance
    weather_source_type: Optional[DataClassification] = None
    weather_retrieval_freshness: Optional[FreshnessStatus] = None
    weather_observation_freshness: Optional[FreshnessStatus] = None
    weather_forecast_validity: Optional[ForecastValidityStatus] = None
    weather_retrieved_at: Optional[datetime] = None
    weather_observed_at: Optional[datetime] = None
    weather_forecast_timestamp: Optional[datetime] = None
    weather_usable: bool = Field(default=True, description="Whether weather telemetry passed strict temporal & forecast validity")
    weather_unusable_reason: Optional[str] = Field(default=None, description="Reason if weather telemetry is unusable")
    evidence_items: Dict[str, EnvironmentalEvidenceItem] = Field(default_factory=dict)
    indian_naqi: Optional[int] = None
    indian_naqi_category: Optional[str] = None
    dominant_pollutant: Optional[str] = None
    dominant_pollutant_reason: Optional[str] = None
    stagnation_risk: str
    dispersion_conditions: str
    limitations: List[str] = Field(default_factory=list)


class AIInsightAction(BaseModel):
    """Single actionable recommendation synthesized under deterministic guardrails."""
    action_id: str = Field(..., description="Identifier matching the deterministic allowlist")
    category: ActionCategory = Field(default=ActionCategory.INDOOR_AIR, description="Action domain category")
    priority: ActionPriority = Field(default=ActionPriority.MEDIUM, description="Action urgency priority")
    title: str = Field(default="", description="Concise actionable directive")
    rationale: str = Field(default="", description="Transparent, science-backed justification")
    evidence_ids: List[str] = Field(default_factory=list, description="IDs of environmental evidence supporting this action")


class AIStructuredSynthesis(BaseModel):
    """Structured output schema requested from Google Gemini SDK."""
    summary: str = Field(..., description="Concise environmental condition summary (1-2 sentences)")
    explanation: str = Field(..., description="Plain-language atmospheric and health context explanation")
    supporting_factors: List[str] = Field(..., description="Key environmental factors justifying recommendations")
    recommended_actions: List[AIInsightAction] = Field(..., description="Actionable recommendations from allowed actions")
    uncertainty_and_limitations: str = Field(..., description="Explicit acknowledgement of model resolution and data limitations")


class AIInsightRequest(BaseModel):
    """Request payload for AI-synthesized environmental insights."""
    latitude: float = Field(..., ge=-90.0, le=90.0, description="WGS84 latitude between -90 and 90")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="WGS84 longitude between -180 and 180")
    activity_context: ActivityContext = Field(
        default=ActivityContext.GENERAL,
        description="Optional activity focus for tailored advice"
    )


class AIInsightResponse(BaseModel):
    """Final validated response delivered to frontend client."""
    location: LocationMetadata
    activity_context: ActivityContext
    status: AIGenerationStatus = Field(..., description="AI generation status or deterministic fallback reason")
    model_id: Optional[str] = Field(None, description="Gemini model identifier used for synthesis, if generated")
    prompt_version: str = Field(..., description="Version of the intelligence prompt template")
    generated_at: datetime = Field(..., description="UTC timestamp of synthesis")
    summary: str = Field(..., description="Concise environmental summary")
    explanation: str = Field(..., description="Plain-language explanation grounded in evidence")
    supporting_factors: List[str] = Field(default_factory=list, description="Environmental factors supporting the insights")
    recommended_actions: List[AIInsightAction] = Field(default_factory=list, description="Validated recommendations")
    evidence_context: Dict[str, EnvironmentalEvidenceItem] = Field(default_factory=dict, description="Verifiable evidence map")
    source_classification: DataClassification = Field(..., description="Source classification of underlying telemetry")
    quality_status: QualityStatus = Field(..., description="Telemetry quality rating")
    retrieval_freshness: FreshnessStatus = Field(..., description="Freshness of telemetry retrieval")
    limitations: List[str] = Field(default_factory=list, description="Explicit technical and environmental limitations")
    fallback_reason: Optional[str] = Field(None, description="Explanation when running under deterministic fallback")
