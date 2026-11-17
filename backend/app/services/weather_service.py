"""Weather service fetching and normalizing surface meteorology and boundary layer dispersion telemetry."""
from typing import Optional
import httpx

from ..schemas.weather import NormalizedWeatherResponse
from ..providers.open_meteo import OpenMeteoWeatherProvider
from .data_validation import validate_coordinates


class WeatherService:
    """Service orchestrating meteorological and boundary layer telemetry."""

    def __init__(self, weather_provider: Optional[OpenMeteoWeatherProvider] = None):
        self.provider = weather_provider or OpenMeteoWeatherProvider()

    async def get_current_weather(
        self,
        latitude: float,
        longitude: float,
        client: Optional[httpx.AsyncClient] = None
    ) -> NormalizedWeatherResponse:
        """Fetch current weather and atmospheric boundary layer dispersion metrics."""
        coords = validate_coordinates(latitude, longitude)
        return await self.provider.get_current_weather(coords.latitude, coords.longitude, client=client)


weather_service = WeatherService()
