"""Health check endpoint."""
from datetime import datetime, timezone
from fastapi import APIRouter
from ...core.config import settings

router = APIRouter(tags=["Health"])

START_TIME = datetime.now(timezone.utc)


@router.get("/health", summary="Service Health Check")
async def health_check():
    """Returns application health, version, uptime, and configuration summary."""
    now = datetime.now(timezone.utc)
    uptime_seconds = int((now - START_TIME).total_seconds())

    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "uptime_seconds": uptime_seconds,
        "timestamp": now.isoformat(),
        "providers": {
            "open_meteo": "operational",
            "openaq": "configured" if settings.OPENAQ_API_KEY else "not_configured",
            "cpcb_india": "pending_verified_access"
        }
    }
