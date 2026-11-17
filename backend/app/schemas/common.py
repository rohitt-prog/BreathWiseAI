"""Common enums, coordinates, and base models."""
from enum import Enum
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator


class DataClassification(str, Enum):
    """Source classification of environmental telemetry."""
    OBSERVATION = "OBSERVATION"
    MODELLED_FORECAST = "MODELLED_FORECAST"
    SIMULATED_DEMO = "SIMULATED_DEMO"


class FreshnessStatus(str, Enum):
    """Temporal freshness classification of data retrieval.

    Indicates how recently the backend retrieved data from the provider.
    - FRESH: Retrieved within the last 60 minutes.
    - RECENT: Retrieved within 60-180 minutes.
    - STALE: Retrieved more than 180 minutes ago.
    - UNAVAILABLE: No timestamp available.
    - NOT_CONFIGURED: Provider lacks configuration/API key.
    """
    FRESH = "FRESH"
    RECENT = "RECENT"
    STALE = "STALE"
    UNAVAILABLE = "UNAVAILABLE"
    INVALID = "INVALID"
    NOT_CONFIGURED = "NOT_CONFIGURED"


class ForecastValidityStatus(str, Enum):
    """Validity window of a forecast timestep relative to current time.

    Separates forecast validity from data retrieval freshness.
    - CURRENT_PERIOD: Forecast valid for current hour window (±60 min).
    - FUTURE_PERIOD: Forecast valid for upcoming future hours.
    - HISTORICAL_PERIOD: Forecast valid for previous hours.
    - NOT_APPLICABLE: Applicable only to physical observations.
    """
    CURRENT_PERIOD = "CURRENT_PERIOD"
    FUTURE_PERIOD = "FUTURE_PERIOD"
    HISTORICAL_PERIOD = "HISTORICAL_PERIOD"
    NOT_APPLICABLE = "NOT_APPLICABLE"


class QualityStatus(str, Enum):
    """Quality and calibration provenance status."""
    VERIFIED_OFFICIAL = "VERIFIED_OFFICIAL"
    UNVERIFIED_SENSOR = "UNVERIFIED_SENSOR"
    MODELLED_APPROXIMATION = "MODELLED_APPROXIMATION"
    SIMULATED_SCENARIO = "SIMULATED_SCENARIO"
    UNAVAILABLE = "UNAVAILABLE"


class Coordinates(BaseModel):
    """Geographic coordinate pair with strict boundary validation."""
    latitude: float = Field(..., ge=-90.0, le=90.0, description="WGS84 latitude between -90 and 90")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="WGS84 longitude between -180 and 180")

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, v: float) -> float:
        if not (-90.0 <= v <= 90.0):
            raise ValueError(f"Latitude must be between -90 and 90 degrees; received {v}")
        return round(v, 6)

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, v: float) -> float:
        if not (-180.0 <= v <= 180.0):
            raise ValueError(f"Longitude must be between -180 and 180 degrees; received {v}")
        return round(v, 6)


class LocationMetadata(BaseModel):
    """Resolved location metadata attached to telemetry responses."""
    latitude: float
    longitude: float
    name: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None


class ErrorResponse(BaseModel):
    """Standardized API error response schema."""
    error: str
    message: str
    status_code: int
    details: Optional[Dict[str, Any]] = None
    timestamp: str
