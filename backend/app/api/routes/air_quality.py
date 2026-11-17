"""Air quality API routes."""
from typing import Optional
from fastapi import APIRouter, Query, Depends
from ...schemas.air_quality import NormalizedAirQualityResponse, AirQualityForecastResponse
from ...services.air_quality_service import AirQualityService, air_quality_service

router = APIRouter(prefix="/air-quality", tags=["Air Quality"])


@router.get(
    "/current",
    response_model=NormalizedAirQualityResponse,
    summary="Get current validated air quality telemetry"
)
async def get_current_air_quality(
    latitude: float = Query(..., ge=-90.0, le=90.0, description="Latitude between -90 and 90"),
    longitude: float = Query(..., ge=-180.0, le=180.0, description="Longitude between -180 and 180"),
    service: AirQualityService = Depends(lambda: air_quality_service)
) -> NormalizedAirQualityResponse:
    """Retrieve normalized current air quality readings.

    If physical ground sensors (OpenAQ) are configured and within range, returns measured observations.
    Otherwise, returns Open-Meteo CAMS atmospheric chemistry model forecasts clearly classified
    as MODELLED_FORECAST. Official Indian NAQI is returned as null if certified CPCB data is unavailable.
    """
    return await service.get_current_air_quality(latitude=latitude, longitude=longitude)


@router.get(
    "/forecast",
    response_model=AirQualityForecastResponse,
    summary="Get hourly air quality forecast"
)
async def get_air_quality_forecast(
    latitude: float = Query(..., ge=-90.0, le=90.0, description="Latitude between -90 and 90"),
    longitude: float = Query(..., ge=-180.0, le=180.0, description="Longitude between -180 and 180"),
    hours: Optional[int] = Query(None, ge=1, le=72, description="Optional slice limit for forecast hours (1-72)"),
    service: AirQualityService = Depends(lambda: air_quality_service)
) -> AirQualityForecastResponse:
    """Retrieve hourly pollutant forecast points derived from atmospheric chemistry models."""
    return await service.get_air_quality_forecast(latitude=latitude, longitude=longitude, hours=hours)
