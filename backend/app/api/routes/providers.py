"""Environmental data provider status routes."""
from fastapi import APIRouter, Depends
from ...schemas.providers import ProvidersStatusResponse
from ...services.air_quality_service import AirQualityService, air_quality_service

router = APIRouter(prefix="/providers", tags=["Providers"])


@router.get(
    "/status",
    response_model=ProvidersStatusResponse,
    summary="Get configuration and operational status of all environmental data providers"
)
async def get_providers_status(
    service: AirQualityService = Depends(lambda: air_quality_service)
) -> ProvidersStatusResponse:
    """Returns availability, configuration, and source classifications of Open-Meteo, OpenAQ, and CPCB."""
    return service.get_providers_status()
