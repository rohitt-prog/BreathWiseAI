"""Integration tests for FastAPI REST API endpoints."""
import pytest
import respx
import httpx
from httpx import AsyncClient
from app.core.config import settings


@pytest.mark.asyncio
@respx.mock
async def test_get_current_air_quality_endpoint(async_client: AsyncClient, mock_open_meteo_aqi_payload):
    """Test GET /api/v1/air-quality/current returns normalized response."""
    respx.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_aqi_payload)
    )

    response = await async_client.get("/api/v1/air-quality/current?latitude=28.6508&longitude=77.3152")
    assert response.status_code == 200
    data = response.json()

    assert data["provider"] == "Open-Meteo CAMS Air Quality Forecast"
    assert data["source_type"] == "MODELLED_FORECAST"
    assert data["indian_naqi"] is None
    # Modelled data must NOT establish an official dominant pollutant
    assert data["dominant_pollutant"] is None
    assert "Instantaneous modelled concentrations cannot establish" in data["dominant_pollutant_reason"]
    assert "PM2.5" in data["available_pollutants"]
    assert data["available_pollutants"]["PM2.5"]["concentration"] == 142.5
    assert "source_attribution" in data
    assert len(data["limitations"]) > 0


@pytest.mark.asyncio
@respx.mock
async def test_get_air_quality_forecast_endpoint(async_client: AsyncClient, mock_open_meteo_aqi_payload):
    """Test GET /api/v1/air-quality/forecast."""
    respx.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_aqi_payload)
    )

    response = await async_client.get("/api/v1/air-quality/forecast?latitude=28.6508&longitude=77.3152")
    assert response.status_code == 200
    data = response.json()
    assert len(data["hourly_forecast"]) == 3
    assert data["source_type"] == "MODELLED_FORECAST"


@pytest.mark.asyncio
@respx.mock
async def test_get_weather_endpoint(async_client: AsyncClient, mock_open_meteo_weather_payload):
    """Test GET /api/v1/weather/current."""
    respx.get(settings.OPEN_METEO_WEATHER_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_weather_payload)
    )

    response = await async_client.get("/api/v1/weather/current?latitude=28.6508&longitude=77.3152")
    assert response.status_code == 200
    data = response.json()
    assert data["temperature_c"] == 18.5
    assert data["boundary_layer_height_meters"] == 210.0
    assert data["stagnation_risk"] == "Elevated"
    assert data["dispersion_conditions"] == "Potentially Unfavorable"
    # Strict compliance: obsolete inversion_risk field must NOT be exposed
    assert "inversion_risk" not in data
    assert data["observed_at"] is None
    assert data["forecast_timestamp"] is not None


@pytest.mark.asyncio
async def test_get_providers_status_endpoint(async_client: AsyncClient):
    """Test GET /api/v1/providers/status."""
    response = await async_client.get("/api/v1/providers/status")
    assert response.status_code == 200
    data = response.json()
    assert "providers" in data
    provider_ids = [p["provider_id"] for p in data["providers"]]
    assert "open_meteo" in provider_ids
    assert "openaq" in provider_ids
    assert "cpcb_india" in provider_ids


@pytest.mark.asyncio
async def test_endpoint_coordinate_validation_out_of_bounds(async_client: AsyncClient):
    """Test coordinates out of geographic limits return 422 or 400 error."""
    # Latitude 150 > 90
    response = await async_client.get("/api/v1/air-quality/current?latitude=150.0&longitude=77.3152")
    assert response.status_code in [400, 422]
    data = response.json()
    assert "error" in data


@pytest.mark.asyncio
@respx.mock
async def test_endpoint_provider_failure_returns_503(async_client: AsyncClient):
    """Test upstream provider failure returns standard 503 error response, NOT 200 with fake data."""
    respx.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
        return_value=httpx.Response(502, text="Bad Gateway")
    )

    response = await async_client.get("/api/v1/air-quality/current?latitude=28.6508&longitude=77.3152")
    assert response.status_code == 503
    data = response.json()
    assert data["error"] == "ProviderUnavailableError"
    assert "temporarily unavailable" in data["message"]
