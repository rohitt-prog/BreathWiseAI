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
    "ProvidersStatusResponse"
]
