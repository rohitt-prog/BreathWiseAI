"""API routes package exports."""
from .health import router as health_router
from .air_quality import router as air_quality_router
from .weather import router as weather_router
from .providers import router as providers_router

__all__ = [
    "health_router",
    "air_quality_router",
    "weather_router",
    "providers_router"
]
