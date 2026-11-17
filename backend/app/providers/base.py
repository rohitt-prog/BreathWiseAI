"""Base abstract interfaces for environmental telemetry providers."""
from abc import ABC, abstractmethod
from typing import Optional
from ..schemas.air_quality import NormalizedAirQualityResponse, AirQualityForecastResponse
from ..schemas.weather import NormalizedWeatherResponse
from ..schemas.common import DataClassification


class BaseAirQualityProvider(ABC):
    """Abstract interface for air quality providers."""

    @property
    @abstractmethod
    def provider_id(self) -> str:
        """Unique identifier of the provider."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable provider name."""
        pass

    @property
    @abstractmethod
    def classification(self) -> DataClassification:
        """Source classification (OBSERVATION, MODELLED_FORECAST, etc.)."""
        pass

    @abstractmethod
    def is_configured(self) -> bool:
        """Returns True if the provider is fully configured with required credentials."""
        pass

    @abstractmethod
    async def get_current_air_quality(self, latitude: float, longitude: float) -> NormalizedAirQualityResponse:
        """Fetch and normalize current air quality telemetry."""
        pass

    @abstractmethod
    async def get_forecast(self, latitude: float, longitude: float) -> AirQualityForecastResponse:
        """Fetch and normalize hourly forecast air quality telemetry."""
        pass


class BaseWeatherProvider(ABC):
    """Abstract interface for meteorological providers."""

    @property
    @abstractmethod
    def provider_id(self) -> str:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    def is_configured(self) -> bool:
        pass

    @abstractmethod
    async def get_current_weather(self, latitude: float, longitude: float) -> NormalizedWeatherResponse:
        """Fetch and normalize current surface weather and boundary layer dispersion telemetry."""
        pass
