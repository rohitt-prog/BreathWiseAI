"""Main FastAPI application entry point."""
from datetime import datetime, timezone
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from .core.config import settings
from .core.exceptions import BreatheWiseException, CoordinateValidationError, ProviderUnavailableError
from .core.logging import logger
from .api.routes.health import router as health_router
from .api import api_v1_router


def create_application() -> FastAPI:
    """Application factory for BreatheWise AI backend."""
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description=(
            "Production-oriented environmental telemetry backend for BreatheWise AI. "
            "Normalizes multi-source data (Open-Meteo, OpenAQ, CPCB) with strict source classification, "
            "temporal freshness metadata, and deterministic environmental integrity."
        ),
        openapi_tags=[
            {"name": "Health", "description": "System health and provider readiness checks"},
            {"name": "Air Quality", "description": "Current and forecast atmospheric composition telemetry"},
            {"name": "Weather", "description": "Surface meteorology and boundary layer dispersion telemetry"},
            {"name": "Providers", "description": "Operational status and provenance for environmental data sources"},
            {"name": "AI Intelligence Engine", "description": "Evidence-grounded Google Gemini recommendations governed by deterministic safety"}
        ]
    )

    # Restrictive CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    # Custom Exception Handlers
    @app.exception_handler(CoordinateValidationError)
    async def coordinate_validation_handler(request: Request, exc: CoordinateValidationError):
        logger.warning("Coordinate validation error on %s: %s", request.url.path, exc.message)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error": "CoordinateValidationError",
                "message": exc.message,
                "status_code": 400,
                "details": exc.details,
                "timestamp": exc.timestamp
            }
        )

    @app.exception_handler(ProviderUnavailableError)
    async def provider_unavailable_handler(request: Request, exc: ProviderUnavailableError):
        logger.error("Provider unavailable error on %s: %s", request.url.path, exc.message)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "error": "ProviderUnavailableError",
                "message": exc.message,
                "status_code": 503,
                "details": exc.details,
                "timestamp": exc.timestamp
            }
        )

    @app.exception_handler(BreatheWiseException)
    async def breathewise_exception_handler(request: Request, exc: BreatheWiseException):
        logger.error("BreatheWise error on %s: %s", request.url.path, exc.message)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.__class__.__name__,
                "message": exc.message,
                "status_code": exc.status_code,
                "details": exc.details,
                "timestamp": exc.timestamp
            }
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        logger.warning("Request schema validation failure on %s", request.url.path)
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": "RequestValidationError",
                "message": "Supplied query parameters or request body failed schema validation.",
                "status_code": 422,
                "details": {"errors": exc.errors()},
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled server exception on %s: %s", request.url.path, str(exc))
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "InternalServerError",
                "message": "An unexpected server error occurred while processing the request.",
                "status_code": 500,
                "details": {},
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )

    # Mount Routes
    app.include_router(health_router)
    app.include_router(health_router, prefix=settings.API_V1_STR)
    app.include_router(api_v1_router, prefix=settings.API_V1_STR)

    return app


app = create_application()
