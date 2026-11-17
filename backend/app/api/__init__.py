"""API package router."""
from fastapi import APIRouter
from .routes.air_quality import router as air_quality_router
from .routes.weather import router as weather_router
from .routes.providers import router as providers_router

api_v1_router = APIRouter()
api_v1_router.include_router(air_quality_router)
api_v1_router.include_router(weather_router)
api_v1_router.include_router(providers_router)

__all__ = ["api_v1_router"]
