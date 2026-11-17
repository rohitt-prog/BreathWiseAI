"""Weather telemetry normalized Pydantic schemas."""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field
from .common import DataClassification, FreshnessStatus, ForecastValidityStatus, LocationMetadata


class NormalizedWeatherResponse(BaseModel):
    """Normalized weather and boundary layer stagnation telemetry.

    Strictly separates:
    - retrieved_at: UTC timestamp when data was fetched from provider.
    - forecast_timestamp: Timestep represented by the forecast prediction.
    - observed_at: Strictly reserved for physical sensor observations (null for modelled weather).
    - model_run_timestamp / model_data_available_at: Initialization and publication times if exposed by provider.
    """
    location: LocationMetadata
    provider: str = Field(..., description="Provider name (e.g. Open-Meteo Weather Forecast)")
    source_type: DataClassification = Field(default=DataClassification.MODELLED_FORECAST)
    retrieved_at: datetime = Field(..., description="UTC retrieval timestamp by backend API")
    model_run_timestamp: Optional[datetime] = Field(
        None,
        description="Initialization timestamp of NWP model cycle if reliably available; null if unexposed"
    )
    model_data_available_at: Optional[datetime] = Field(
        None,
        description="Publication timestamp of model output if reliably available; null if unexposed"
    )
    forecast_timestamp: Optional[datetime] = Field(
        None,
        description="Valid timestamp represented by the numerical model prediction"
    )
    observed_at: Optional[datetime] = Field(
        None,
        description="Timestamp of physical sensor observation. Strictly null for modelled forecasts."
    )
    retrieval_freshness: FreshnessStatus = Field(
        default=FreshnessStatus.FRESH,
        description="Freshness classification based on retrieved_at age"
    )
    freshness_status: FreshnessStatus = Field(
        default=FreshnessStatus.FRESH,
        description="Backward-compatible alias for retrieval_freshness"
    )
    model_run_freshness: FreshnessStatus = Field(
        default=FreshnessStatus.UNAVAILABLE,
        description="Freshness classification of numerical model run cycle. UNAVAILABLE if unexposed by provider."
    )
    observation_age_minutes: Optional[float] = Field(
        None,
        description="Elapsed minutes since physical observation was recorded at sensor. Strictly null for modelled forecasts."
    )
    observation_freshness: Optional[FreshnessStatus] = Field(
        None,
        description="Freshness tier of physical observation timestamp. Strictly null for modelled forecasts."
    )
    forecast_validity: Optional[ForecastValidityStatus] = Field(
        None,
        description="Validity window of forecast timestep relative to current time"
    )
    temperature_c: Optional[float] = Field(None, description="Ambient surface temperature in Celsius")
    relative_humidity: Optional[float] = Field(None, description="Relative humidity in percentage (0-100)")
    wind_speed_kmh: Optional[float] = Field(None, description="10m surface wind speed in km/h")
    wind_direction_degrees: Optional[float] = Field(None, description="Wind direction in degrees (0-360)")
    wind_direction_cardinal: Optional[str] = Field(None, description="Cardinal compass direction (N, NE, E, etc.)")
    boundary_layer_height_meters: Optional[float] = Field(
        None,
        description="Atmospheric boundary layer mixing ceiling height in meters"
    )
    stagnation_risk: str = Field(
        ...,
        description="Meteorological stagnation risk heuristic: 'Low', 'Moderate', 'Elevated', or 'Unknown'"
    )
    dispersion_conditions: str = Field(
        ...,
        description="Atmospheric dispersion conditions: 'Favorable', 'Moderate', 'Potentially Unfavorable', or 'Unknown'"
    )
    stagnation_description: str = Field(
        ...,
        description="Documented heuristic explanation of boundary layer mixing and horizontal ventilation"
    )
    source_attribution: str = Field(..., description="Source attribution and model disclosure")
    limitations: List[str] = Field(default_factory=list, description="Technical caveats and model resolution details")
