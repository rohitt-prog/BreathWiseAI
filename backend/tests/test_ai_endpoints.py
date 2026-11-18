"""Integration tests for AI insights API endpoint."""
import pytest
from httpx import AsyncClient, ASGITransport
import respx
import httpx

from app.main import app
from app.core.config import settings


@pytest.fixture
def mock_open_meteo_air_quality_payload():
    return {
        "latitude": 28.65,
        "longitude": 77.25,
        "utc_offset_seconds": 0,
        "hourly": {
            "time": ["2026-11-18T10:00", "2026-11-18T11:00"],
            "pm2_5": [75.2, 82.4],
            "pm10": [135.0, 142.1],
            "nitrogen_dioxide": [42.1, 44.5],
            "sulphur_dioxide": [12.0, 14.1],
            "carbon_monoxide": [850.0, 900.0],
            "ozone": [35.0, 38.0],
            "us_aqi": [161, 165]
        }
    }


@pytest.fixture
def mock_open_meteo_weather_payload():
    return {
        "latitude": 28.65,
        "longitude": 77.25,
        "utc_offset_seconds": 0,
        "hourly": {
            "time": ["2026-11-18T10:00", "2026-11-18T11:00"],
            "temperature_2m": [22.5, 23.1],
            "relative_humidity_2m": [60.0, 58.0],
            "wind_speed_10m": [6.2, 5.8],
            "wind_direction_10m": [285.0, 290.0],
            "boundary_layer_height": [240.0, 280.0]
        }
    }


@pytest.mark.asyncio
async def test_post_ai_insights_endpoint_success(
    mock_open_meteo_air_quality_payload,
    mock_open_meteo_weather_payload
):
    """POST /api/v1/ai/insights successfully retrieves telemetry and returns valid AIInsightResponse."""
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_air_quality_payload)
        )
        respx_mock.get(settings.OPEN_METEO_WEATHER_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_weather_payload)
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                "/api/v1/ai/insights",
                json={"latitude": 28.65, "longitude": 77.25, "activity_context": "GENERAL"}
            )

    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "summary" in data
    assert "explanation" in data
    assert "recommended_actions" in data
    assert "evidence_context" in data
    assert "source_classification" in data
    assert data["source_classification"] == "MODELLED_FORECAST"
    assert len(data["recommended_actions"]) >= 1


@pytest.mark.asyncio
async def test_post_ai_insights_invalid_coordinates():
    """POST /api/v1/ai/insights rejects out-of-bounds coordinates with HTTP 400."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/ai/insights",
            json={"latitude": 105.0, "longitude": 77.25}
        )

    # Note: Pydantic field_validator / ge=-90, le=90 raises validation error (422 or 400 via CoordinateValidationError)
    assert response.status_code in (400, 422)


@pytest.mark.asyncio
async def test_post_ai_insights_invalid_activity_context():
    """POST /api/v1/ai/insights rejects unknown activity_context with HTTP 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/ai/insights",
            json={"latitude": 28.65, "longitude": 77.25, "activity_context": "INVALID_UNKNOWN_CONTEXT"}
        )

    assert response.status_code == 422
    data = response.json()
    assert "validation" in data["message"].lower() or "errors" in str(data).lower()


@pytest.mark.asyncio
async def test_missing_gemini_credentials_do_not_break_existing_endpoints(
    mock_open_meteo_air_quality_payload,
    mock_open_meteo_weather_payload
):
    """Verify that unconfigured Gemini credentials do not affect health or environmental routes."""
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_air_quality_payload)
        )
        respx_mock.get(settings.OPEN_METEO_WEATHER_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_weather_payload)
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Health check
            res_health = await ac.get("/health")
            assert res_health.status_code == 200

            # 2. Providers status
            res_prov = await ac.get("/api/v1/providers/status")
            assert res_prov.status_code == 200

            # 3. Current air quality
            res_aq = await ac.get("/api/v1/air-quality/current?latitude=28.65&longitude=77.25")
            assert res_aq.status_code == 200

            # 4. Current weather
            res_weather = await ac.get("/api/v1/weather/current?latitude=28.65&longitude=77.25")
            assert res_weather.status_code == 200
