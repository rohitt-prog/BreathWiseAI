"""AI Insights API routes."""
from fastapi import APIRouter, status, Depends
from ...schemas.ai import AIInsightRequest, AIInsightResponse
from ...schemas.common import ErrorResponse
from ...services.ai_service import ai_service
from ...core.rate_limiter import check_ai_rate_limit

router = APIRouter(prefix="/ai", tags=["AI Intelligence Engine"])


@router.post(
    "/insights",
    response_model=AIInsightResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate evidence-grounded air quality guidance using Gemini AI",
    description=(
        "Translates validated environmental telemetry and atmospheric physics into understandable, "
        "evidence-backed personal recommendations via Google Gemini, strictly governed by deterministic "
        "safety rules. Automatically falls back to deterministic protective guidance if Gemini is "
        "unavailable, unconfigured, or produces an invalid response."
    ),
    dependencies=[Depends(check_ai_rate_limit)],
    responses={
        200: {"model": AIInsightResponse, "description": "Structured AI insights or safe deterministic fallback"},
        400: {"model": ErrorResponse, "description": "Invalid geographic coordinates"},
        422: {"model": ErrorResponse, "description": "Request body validation failure"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded (too many requests)"}
    }
)
async def get_ai_insights(request: AIInsightRequest) -> AIInsightResponse:
    """Ingest telemetry, evaluate deterministic safety rules, and synthesize insights."""
    return await ai_service.get_insights(request)
