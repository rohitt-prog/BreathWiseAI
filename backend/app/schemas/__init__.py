"""Schemas package exports."""
from .common import (
    DataClassification,
    FreshnessStatus,
    QualityStatus,
    Coordinates,
    LocationMetadata,
    ErrorResponse
)
from .air_quality import (
    NormalizedPollutant,
    HourlyForecastPoint,
    NormalizedAirQualityResponse,
    AirQualityForecastResponse
)
from .weather import NormalizedWeatherResponse
from .providers import ProviderStatusItem, ProvidersStatusResponse
from .ai import (
    ActivityContext,
    AIGenerationStatus,
    ActionCategory,
    ActionPriority,
    EnvironmentalEvidenceItem,
    EnvironmentalEvidenceContext,
    AIInsightAction,
    AIStructuredSynthesis,
    AIInsightRequest,
    AIInsightResponse
)

__all__ = [
    "DataClassification",
    "FreshnessStatus",
    "QualityStatus",
    "Coordinates",
    "LocationMetadata",
    "ErrorResponse",
    "NormalizedPollutant",
    "HourlyForecastPoint",
    "NormalizedAirQualityResponse",
    "AirQualityForecastResponse",
    "NormalizedWeatherResponse",
    "ProviderStatusItem",
    "ProvidersStatusResponse",
    "ActivityContext",
    "AIGenerationStatus",
    "ActionCategory",
    "ActionPriority",
    "EnvironmentalEvidenceItem",
    "EnvironmentalEvidenceContext",
    "AIInsightAction",
    "AIStructuredSynthesis",
    "AIInsightRequest",
    "AIInsightResponse"
]
