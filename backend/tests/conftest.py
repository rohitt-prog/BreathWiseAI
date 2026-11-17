"""Pytest configuration and shared fixtures."""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest_asyncio.fixture
async def async_client():
    """Async test client bound to ASGI FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def mock_open_meteo_aqi_payload():
    """Standardized Open-Meteo Air Quality JSON fixture."""
    return {
        "latitude": 28.65,
        "longitude": 77.31,
        "generationtime_ms": 0.42,
        "utc_offset_seconds": 0,
        "timezone": "UTC",
        "current": {
            "time": "2026-11-29T10:00",
            "interval": 3600,
            "pm2_5": 142.5,
            "pm10": 260.8,
            "carbon_monoxide": 1850.0,  # in µg/m³
            "nitrogen_dioxide": 82.4,
            "sulphur_dioxide": 24.1,
            "ozone": 45.0,
            "us_aqi": 195,
            "european_aqi": 78
        },
        "current_units": {
            "time": "iso8601",
            "interval": "seconds",
            "pm2_5": "µg/m³",
            "pm10": "µg/m³",
            "carbon_monoxide": "µg/m³",
            "nitrogen_dioxide": "µg/m³",
            "sulphur_dioxide": "µg/m³",
            "ozone": "µg/m³",
            "us_aqi": "USAQI",
            "european_aqi": "EAQI"
        },
        "hourly": {
            "time": ["2026-11-29T10:00", "2026-11-29T11:00", "2026-11-29T12:00"],
            "pm2_5": [142.5, 138.2, 125.0],
            "pm10": [260.8, 250.0, 230.1],
            "carbon_monoxide": [1850.0, 1720.0, 1600.0],
            "nitrogen_dioxide": [82.4, 79.1, 71.0],
            "sulphur_dioxide": [24.1, 22.0, 20.0],
            "ozone": [45.0, 52.0, 60.0],
            "us_aqi": [195, 192, 186],
            "european_aqi": [78, 76, 72]
        }
    }


@pytest.fixture
def mock_open_meteo_weather_payload():
    """Standardized Open-Meteo Weather JSON fixture."""
    return {
        "latitude": 28.65,
        "longitude": 77.31,
        "current": {
            "time": "2026-11-29T10:00",
            "temperature_2m": 18.5,
            "relative_humidity_2m": 68,
            "wind_speed_10m": 4.2,
            "wind_direction_10m": 290
        },
        "hourly": {
            "time": ["2026-11-29T10:00", "2026-11-29T11:00"],
            "boundary_layer_height": [210.0, 240.0]
        }
    }


@pytest.fixture
def mock_openaq_locations_payload():
    """OpenAQ v3 locations response fixture."""
    return {
        "meta": {"name": "openaq-api", "license": "CC-BY-4.0", "limit": 1, "page": 1, "total": 1},
        "results": [
            {
                "id": 9845,
                "name": "Anand Vihar Monitor Node",
                "coordinates": {"latitude": 28.6508, "longitude": 77.3152},
                "country": {"id": 1, "code": "IN", "name": "India"}
            }
        ]
    }


@pytest.fixture
def mock_openaq_latest_payload():
    """OpenAQ v3 location latest sensors fixture."""
    from datetime import datetime, timezone, timedelta
    t_iso = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat().replace("+00:00", "Z")
    return {
        "meta": {"name": "openaq-api", "limit": 10},
        "results": [
            {
                "parameter": {"id": 2, "name": "pm25", "units": "µg/m³"},
                "value": 198.4,
                "datetime": {"utc": t_iso, "local": t_iso}
            },
            {
                "parameter": {"id": 1, "name": "pm10", "units": "µg/m³"},
                "value": 312.0,
                "datetime": {"utc": t_iso, "local": t_iso}
            },
            {
                "parameter": {"id": 3, "name": "no2", "units": "µg/m³"},
                "value": 92.5,
                "datetime": {"utc": t_iso, "local": t_iso}
            }
        ]
    }
