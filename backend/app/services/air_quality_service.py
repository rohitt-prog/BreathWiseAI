"""Air quality service aggregating providers and enforcing environmental integrity."""
from typing import Optional
from datetime import datetime, timezone
import httpx

from ..core.logging import logger
from ..schemas.air_quality import NormalizedAirQualityResponse, AirQualityForecastResponse
from ..schemas.providers import ProvidersStatusResponse, ProviderStatusItem
from ..schemas.common import DataClassification
from ..providers.open_meteo import OpenMeteoAirQualityProvider, OpenMeteoWeatherProvider
from ..providers.openaq import OpenAQProvider
from ..providers.cpcb import CPCBProvider
from .data_validation import validate_coordinates


class AirQualityService:
    """Service orchestrating air quality and provider status checks."""

    def __init__(
        self,
        open_meteo_provider: Optional[OpenMeteoAirQualityProvider] = None,
        openaq_provider: Optional[OpenAQProvider] = None,
        cpcb_provider: Optional[CPCBProvider] = None
    ):
        self.open_meteo = open_meteo_provider or OpenMeteoAirQualityProvider()
        self.openaq = openaq_provider or OpenAQProvider()
        self.cpcb = cpcb_provider or CPCBProvider()

    async def get_current_air_quality(
        self,
        latitude: float,
        longitude: float,
        client: Optional[httpx.AsyncClient] = None
    ) -> NormalizedAirQualityResponse:
        """Fetch current air quality telemetry with multi-source fallback and transparent provenance.

        Priority:
        1. OpenAQ Ground Monitors (if configured with API key and available within 25km).
        2. Open-Meteo CAMS Atmospheric Composition Model (always available, clearly labeled MODELLED_FORECAST).
        """
        # Validate coordinates first
        coords = validate_coordinates(latitude, longitude)

        # 1. Check if OpenAQ physical station is configured
        if self.openaq.is_configured():
            try:
                logger.info("OpenAQ API key detected; querying physical ground stations for (%s, %s)", coords.latitude, coords.longitude)
                openaq_res = await self.openaq.get_current_air_quality(coords.latitude, coords.longitude, client=client)
                # If ground sensors returned valid pollutants, return observation
                if openaq_res.available_pollutants:
                    return openaq_res
            except Exception as exc:
                logger.warning("OpenAQ query failed; gracefully falling back to Open-Meteo: %s", str(exc))

        # 2. Query Open-Meteo CAMS Modelled Forecast
        logger.info("Querying Open-Meteo modelled air quality for (%s, %s)", coords.latitude, coords.longitude)
        return await self.open_meteo.get_current_air_quality(coords.latitude, coords.longitude, client=client)

    async def get_air_quality_forecast(
        self,
        latitude: float,
        longitude: float,
        hours: Optional[int] = None,
        client: Optional[httpx.AsyncClient] = None
    ) -> AirQualityForecastResponse:
        """Fetch hourly air quality forecast from Open-Meteo CAMS."""
        coords = validate_coordinates(latitude, longitude)
        result = await self.open_meteo.get_forecast(coords.latitude, coords.longitude, client=client)
        if hours is not None and hours > 0:
            result.hourly_forecast = result.hourly_forecast[:hours]
        return result

    def get_providers_status(self) -> ProvidersStatusResponse:
        """List operational and configuration status across all environmental data providers."""
        providers_list = [
            ProviderStatusItem(
                provider_id=self.open_meteo.provider_id,
                name=self.open_meteo.name,
                configured=self.open_meteo.is_configured(),
                status="OPERATIONAL",
                classification=self.open_meteo.classification,
                description="European Copernicus Atmosphere Monitoring Service (CAMS) global atmospheric chemistry model.",
                coverage="Global (~40 km grid resolution)",
                notes="Hourly modelled forecast. US/European AQI values are not converted to Indian NAQI."
            ),
            ProviderStatusItem(
                provider_id="open_meteo_weather",
                name="Open-Meteo Weather & Boundary Layer Forecast",
                configured=True,
                status="OPERATIONAL",
                classification=DataClassification.MODELLED_FORECAST,
                description="Numerical Weather Prediction models providing surface weather and boundary layer height.",
                coverage="Global (~11 km grid resolution)",
                notes="Hourly boundary layer height and ventilation dynamics."
            ),
            ProviderStatusItem(
                provider_id=self.openaq.provider_id,
                name=self.openaq.name,
                configured=self.openaq.is_configured(),
                status="OPERATIONAL" if self.openaq.is_configured() else "NOT_CONFIGURED",
                classification=self.openaq.classification,
                description="Global community and government physical air quality monitoring stations.",
                coverage="Global physical sensors",
                notes="Requires OPENAQ_API_KEY. Sensor sets vary by station." if not self.openaq.is_configured() else "Configured with X-API-Key."
            ),
            ProviderStatusItem(
                provider_id=self.cpcb.provider_id,
                name=self.cpcb.name,
                configured=self.cpcb.is_configured(),
                status="PENDING_VERIFIED_ACCESS",
                classification=self.cpcb.classification,
                description="Official statutory ambient air monitoring network of India (Central Pollution Control Board).",
                coverage="India National CAAQMS Network",
                notes="Official automated API access requires registered data.gov.in portal credentials. No unauthorized scraping is performed."
            )
        ]

        return ProvidersStatusResponse(
            retrieved_at=datetime.now(timezone.utc),
            providers=providers_list
        )


air_quality_service = AirQualityService()
