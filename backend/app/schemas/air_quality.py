"""Air quality normalized Pydantic schemas."""
from typing import Optional, Dict, List
from datetime import datetime
from pydantic import BaseModel, Field
from .common import (
    DataClassification,
    FreshnessStatus,
    ForecastValidityStatus,
    QualityStatus,
    LocationMetadata
)


class NormalizedPollutant(BaseModel):
    """Normalized individual pollutant measurement or model prediction."""
    code: str = Field(..., description="Standard code (e.g. PM2.5, PM10, NO2, SO2, CO, O3, NH3, Pb)")
    name: str = Field(..., description="Full descriptive name")
    concentration: float = Field(..., description="Numerical concentration in standardized unit")
    unit: str = Field(..., description="Standard unit (µg/m³ or mg/m³ for CO)")
    source: str = Field(..., description="Provider or station name")
    measurement_timestamp: datetime = Field(..., description="Timestamp of physical measurement or model valid time")
    data_classification: DataClassification = Field(..., description="OBSERVATION or MODELLED_FORECAST")
    validation_status: FreshnessStatus = Field(default=FreshnessStatus.FRESH)
    sub_index: Optional[int] = Field(None, description="Official CPCB sub-index if calculated from certified ground stations; strictly None for modelled data")
    category: Optional[str] = Field(None, description="NAQI category tier if applicable")


class HourlyForecastPoint(BaseModel):
    """Single hourly forecast prediction point."""
    timestamp: datetime = Field(..., description="UTC valid forecast timestamp")
    modelled_aqi_estimate: Optional[int] = Field(
        None,
        description="Optional model index estimate (US AQI / European AQI as reported by model; NOT Indian NAQI)"
    )
    pm2_5: Optional[float] = Field(None, description="Modelled PM2.5 (µg/m³)")
    pm10: Optional[float] = Field(None, description="Modelled PM10 (µg/m³)")
    nitrogen_dioxide: Optional[float] = Field(None, description="Modelled NO2 (µg/m³)")
    sulphur_dioxide: Optional[float] = Field(None, description="Modelled SO2 (µg/m³)")
    ozone: Optional[float] = Field(None, description="Modelled O3 (µg/m³)")
    data_classification: DataClassification = Field(
        default=DataClassification.MODELLED_FORECAST,
        description="Source classification"
    )


class NormalizedAirQualityResponse(BaseModel):
    """Comprehensive normalized air quality response.

    Strictly separates:
    - retrieved_at: UTC timestamp when backend queried the provider.
    - observed_at: Valid physical observation timestamp (strictly null for modelled data).
    - forecast_timestamp: Model valid timestamp (strictly null for physical observations).
    - model_run_timestamp / model_data_available_at: Cycle initialization and publish times if exposed; null if unexposed.
    - retrieval_freshness: Evaluated on retrieved_at age.
    - forecast_validity: Evaluated on forecast_timestamp window.
    """
    location: LocationMetadata
    provider: str = Field(..., description="Provider name (e.g. Open-Meteo CAMS, OpenAQ v3)")
    source_type: DataClassification = Field(..., description="Source classification")
    retrieved_at: datetime = Field(..., description="UTC timestamp when data was fetched")
    model_run_timestamp: Optional[datetime] = Field(
        None,
        description="Initialization timestamp of atmospheric chemistry model cycle if reliably exposed; null if unexposed"
    )
    model_data_available_at: Optional[datetime] = Field(
        None,
        description="Publication timestamp of model output if reliably exposed; null if unexposed"
    )
    observed_at: Optional[datetime] = Field(
        None,
        description="Timestamp of physical sensor observation. Strictly null for modelled forecasts."
    )
    forecast_timestamp: Optional[datetime] = Field(
        None,
        description="Timestamp of atmospheric model valid prediction. Strictly null for physical observations."
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
        description="Elapsed minutes since physical observation was recorded at ground sensor. Strictly null for modelled forecasts."
    )
    observation_freshness: Optional[FreshnessStatus] = Field(
        None,
        description="Freshness tier of physical observation timestamp. Strictly null for modelled forecasts."
    )
    forecast_validity: Optional[ForecastValidityStatus] = Field(
        None,
        description="Validity window of forecast timestamp relative to current time"
    )
    quality_status: QualityStatus
    indian_naqi: Optional[int] = Field(
        None,
        description="Official Indian National AQI integer (0-500). Strictly null if verified CPCB data is unavailable."
    )
    indian_naqi_category: Optional[str] = Field(
        None,
        description="Official Indian NAQI tier (Good, Satisfactory, Moderate, Poor, Very Poor, Severe). Null if unverified."
    )
    indian_naqi_unavailable_reason: Optional[str] = Field(
        None,
        description="Explanation why official Indian NAQI is unavailable (e.g. requires verified CPCB 16h multi-pollutant ground station measurements)."
    )
    dominant_pollutant: Optional[str] = Field(
        None,
        description="Dominant air pollutant identifier (e.g. PM2.5). Null if comparison is scientifically indefensible."
    )
    dominant_pollutant_methodology: Optional[str] = Field(
        None,
        description="Documented methodology used for dominant pollutant selection (e.g. statutory CPCB sub-index vs heuristic NAAQS benchmark ratio)"
    )
    dominant_pollutant_reason: Optional[str] = Field(
        None,
        description="Explanation if dominant pollutant is unavailable or limitations of the heuristic"
    )
    available_pollutants: Dict[str, NormalizedPollutant] = Field(default_factory=dict)
    unavailable_pollutants: List[str] = Field(default_factory=list)
    source_attribution: str = Field(..., description="Attribution text for UI presentation")
    limitations: List[str] = Field(default_factory=list, description="Explicit technical caveats and resolution limitations")


class AirQualityForecastResponse(BaseModel):
    """Normalized hourly air quality forecast response."""
    location: LocationMetadata
    provider: str
    source_type: DataClassification = DataClassification.MODELLED_FORECAST
    retrieved_at: datetime
    model_run_timestamp: Optional[datetime] = None
    model_data_available_at: Optional[datetime] = None
    retrieval_freshness: FreshnessStatus = FreshnessStatus.FRESH
    model_run_freshness: FreshnessStatus = FreshnessStatus.UNAVAILABLE
    hourly_forecast: List[HourlyForecastPoint]
    source_attribution: str
    limitations: List[str] = Field(default_factory=list)
