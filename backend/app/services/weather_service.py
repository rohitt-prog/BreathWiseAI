"""Weather service fetching and normalizing surface meteorology and boundary layer dispersion telemetry."""
from typing import Optional
import httpx

from ..schemas.weather import NormalizedWeatherResponse
from ..providers.open_meteo import OpenMeteoWeatherProvider
from .data_validation import validate_coordinates
from ..core.cache import (
    InMemoryCache,
    telemetry_cache,
    make_cache_key,
    TTL_WEATHER,
)


class WeatherService:
    """Service orchestrating meteorological and boundary layer telemetry."""

    def __init__(
        self,
        weather_provider: Optional[OpenMeteoWeatherProvider] = None,
        cache: Optional[InMemoryCache] = None,
    ):
        self.provider = weather_provider or OpenMeteoWeatherProvider()
        self.cache = cache or telemetry_cache

    async def get_current_weather(
        self,
        latitude: float,
        longitude: float,
        client: Optional[httpx.AsyncClient] = None
    ) -> NormalizedWeatherResponse:
        """Fetch current weather and atmospheric boundary layer dispersion metrics with caching."""
        coords = validate_coordinates(latitude, longitude)
        cache_key = make_cache_key("weather", "current", coords.latitude, coords.longitude)

        async def _fetch() -> NormalizedWeatherResponse:
            return await self.provider.get_current_weather(coords.latitude, coords.longitude, client=client)

        return await self.cache.get_or_set(
            key=cache_key,
            ttl_seconds=TTL_WEATHER,
            fetcher=_fetch,
            clone_fn=lambda r: r.model_copy(deep=True)
        )


weather_service = WeatherService()
