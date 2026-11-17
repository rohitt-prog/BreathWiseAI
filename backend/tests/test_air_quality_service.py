"""Tests for Air Quality Service and CPCB Integrity Rules."""
import pytest
import respx
import httpx
from app.services.air_quality_service import AirQualityService
from app.providers.open_meteo import OpenMeteoAirQualityProvider
from app.providers.openaq import OpenAQProvider
from app.providers.cpcb import calculate_official_cpcb_subindex
from app.core.config import settings
from app.schemas.common import DataClassification


@pytest.mark.asyncio
@respx.mock
async def test_service_returns_open_meteo_when_openaq_unconfigured(monkeypatch, mock_open_meteo_aqi_payload):
    """When OpenAQ has no key, service queries Open-Meteo and returns MODELLED_FORECAST."""
    monkeypatch.setattr(settings, "OPENAQ_API_KEY", None)

    respx.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_aqi_payload)
    )

    service = AirQualityService()
    res = await service.get_current_air_quality(28.6508, 77.3152)

    assert res.source_type == DataClassification.MODELLED_FORECAST
    assert res.indian_naqi is None  # Strictly None
    assert res.provider == "Open-Meteo CAMS Air Quality Forecast"
    assert "PM2.5" in res.available_pollutants


def test_cpcb_piecewise_linear_subindex_calculation():
    """Verify official CPCB breakpoint piecewise calculations."""
    # Good category (0 - 50 AQI)
    assert calculate_official_cpcb_subindex("PM2.5", 15.0) == 25
    assert calculate_official_cpcb_subindex("PM2.5", 30.0) == 50

    # Satisfactory (51 - 100)
    assert calculate_official_cpcb_subindex("PM2.5", 45.0) == 76

    # Moderate (101 - 200)
    assert calculate_official_cpcb_subindex("PM2.5", 75.0) == 150

    # Poor (201 - 300)
    assert calculate_official_cpcb_subindex("PM2.5", 105.0) == 250

    # Very Poor (301 - 400)
    assert calculate_official_cpcb_subindex("PM2.5", 185.0) == 350

    # Severe (401 - 500)
    assert calculate_official_cpcb_subindex("PM2.5", 375.0) in (450, 451)

    # Over 500 capped at 500
    assert calculate_official_cpcb_subindex("PM2.5", 600.0) == 500

    # Unknown pollutant or invalid
    assert calculate_official_cpcb_subindex("UNKNOWN", 50.0) is None
    assert calculate_official_cpcb_subindex("PM2.5", -10.0) is None


def test_service_providers_status_contains_all_sources():
    """Verify provider status endpoint output contains Open-Meteo, OpenAQ, and CPCB."""
    service = AirQualityService()
    status_resp = service.get_providers_status()

    p_ids = [p.provider_id for p in status_resp.providers]
    assert "open_meteo" in p_ids
    assert "open_meteo_weather" in p_ids
    assert "openaq" in p_ids
    assert "cpcb_india" in p_ids
