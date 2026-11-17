"""Application Configuration using Pydantic Settings."""
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    PROJECT_NAME: str = "BreatheWise AI - Urban Air Quality Assistant API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # CORS origins: strict localhost origins for development
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    # Open-Meteo Configuration
    OPEN_METEO_AIR_QUALITY_URL: str = "https://air-quality-api.open-meteo.com/v1/air-quality"
    OPEN_METEO_WEATHER_URL: str = "https://api.open-meteo.com/v1/forecast"
    OPEN_METEO_TIMEOUT_SECONDS: float = 10.0

    # OpenAQ v3 Configuration
    OPENAQ_BASE_URL: str = "https://api.openaq.org/v3"
    OPENAQ_API_KEY: Optional[str] = Field(default=None, description="OpenAQ v3 API Key (optional)")
    OPENAQ_TIMEOUT_SECONDS: float = 10.0

    # Data freshness thresholds (minutes)
    OPEN_METEO_FRESHNESS_MINUTES: int = 180  # Modelled data updates every 1-3 hours
    OBSERVATION_FRESHNESS_MINUTES: int = 120  # Ground sensors update hourly

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
