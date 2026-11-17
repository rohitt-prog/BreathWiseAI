"""Weather and boundary layer stagnation API routes."""
from fastapi import APIRouter, Query, Depends
from ...schemas.weather import NormalizedWeatherResponse
from ...services.weather_service import WeatherService, weather_service

router = APIRouter(prefix="/weather", tags=["Weather"])


@router.get(
    "/current",
    response_model=NormalizedWeatherResponse,
    summary="Get current weather and boundary layer dispersion telemetry"
)
async def get_current_weather(
    latitude: float = Query(..., ge=-90.0, le=90.0, description="Latitude between -90 and 90"),
    longitude: float = Query(..., ge=-180.0, le=180.0, description="Longitude between -180 and 180"),
    service: WeatherService = Depends(lambda: weather_service)
) -> NormalizedWeatherResponse:
    """Retrieve current surface meteorology and atmospheric boundary layer height."""
    return await service.get_current_weather(latitude=latitude, longitude=longitude)
