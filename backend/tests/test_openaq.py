"""Tests for OpenAQ v3 Physical Ground Sensors Provider."""
import pytest
import respx
import httpx
from app.providers.openaq import OpenAQProvider
from app.core.config import settings
from app.schemas.common import DataClassification, FreshnessStatus, QualityStatus
from app.core.exceptions import ProviderUnavailableError


@pytest.mark.asyncio
async def test_openaq_missing_api_key(monkeypatch):
    """When OPENAQ_API_KEY is not configured, provider gracefully returns NOT_CONFIGURED."""
    monkeypatch.setattr(settings, "OPENAQ_API_KEY", None)

    provider = OpenAQProvider()
    assert provider.is_configured() is False

    res = await provider.get_current_air_quality(28.6508, 77.3152)
    assert res.freshness_status == FreshnessStatus.NOT_CONFIGURED
    assert res.quality_status == QualityStatus.UNAVAILABLE
    assert res.source_type == DataClassification.OBSERVATION
    assert len(res.available_pollutants) == 0


@pytest.mark.asyncio
@respx.mock
async def test_openaq_with_api_key_success(
    monkeypatch,
    mock_openaq_locations_payload,
    mock_openaq_latest_payload
):
    """When OPENAQ_API_KEY is set, queries /locations and /latest with X-API-Key header."""
    fake_key = "test_openaq_secret_key_123"
    monkeypatch.setattr(settings, "OPENAQ_API_KEY", fake_key)

    provider = OpenAQProvider()
    assert provider.is_configured() is True

    # Mock locations call
    loc_route = respx.get(f"{settings.OPENAQ_BASE_URL}/locations").mock(
        return_value=httpx.Response(200, json=mock_openaq_locations_payload)
    )
    # Mock latest call
    latest_route = respx.get(f"{settings.OPENAQ_BASE_URL}/locations/9845/latest").mock(
        return_value=httpx.Response(200, json=mock_openaq_latest_payload)
    )

    res = await provider.get_current_air_quality(28.6508, 77.3152)

    # Verify X-API-Key header was sent
    assert loc_route.calls.last.request.headers["X-API-Key"] == fake_key
    assert latest_route.calls.last.request.headers["X-API-Key"] == fake_key

    # Verify results
    assert res.source_type == DataClassification.OBSERVATION
    assert res.quality_status == QualityStatus.UNAVAILABLE or res.quality_status == QualityStatus.UNVERIFIED_SENSOR
    assert res.location.name == "Anand Vihar Monitor Node"
    assert "PM2.5" in res.available_pollutants
    assert res.available_pollutants["PM2.5"].concentration == 198.4
    assert res.available_pollutants["PM10"].concentration == 312.0
    assert res.available_pollutants["NO2"].concentration == 92.5
    assert res.indian_naqi is None  # NAQI unverified without official 16-24h CPCB averaging


@pytest.mark.asyncio
@respx.mock
async def test_openaq_no_locations_found(monkeypatch):
    """When OpenAQ returns empty results list (no monitors within 25km)."""
    monkeypatch.setattr(settings, "OPENAQ_API_KEY", "valid_key")

    respx.get(f"{settings.OPENAQ_BASE_URL}/locations").mock(
        return_value=httpx.Response(200, json={"results": []})
    )

    provider = OpenAQProvider()
    res = await provider.get_current_air_quality(15.0, 75.0)

    assert res.freshness_status == FreshnessStatus.UNAVAILABLE
    assert len(res.available_pollutants) == 0
    assert "No OpenAQ monitoring stations found" in res.indian_naqi_unavailable_reason


@pytest.mark.asyncio
@respx.mock
async def test_openaq_non_chronological_multiple_observations(monkeypatch):
    """When multiple records exist for the same parameter in non-chronological order,
    the chronologically latest valid observation MUST be selected.
    """
    monkeypatch.setattr(settings, "OPENAQ_API_KEY", "valid_key")

    respx.get(f"{settings.OPENAQ_BASE_URL}/locations").mock(
        return_value=httpx.Response(200, json={
            "results": [{
                "id": 1234,
                "name": "Test Chrono Station",
                "coordinates": {"latitude": 28.6, "longitude": 77.2}
            }]
        })
    )

    from datetime import datetime, timezone, timedelta
    t_newer = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat().replace("+00:00", "Z")
    t_older = (datetime.now(timezone.utc) - timedelta(minutes=45)).isoformat().replace("+00:00", "Z")

    # First record is newer (210.0), second record is older (150.0)
    respx.get(f"{settings.OPENAQ_BASE_URL}/locations/1234/latest").mock(
        return_value=httpx.Response(200, json={
            "results": [
                {
                    "parameter": {"name": "pm25"},
                    "value": 210.0,
                    "unit": "µg/m³",
                    "datetime": {"utc": t_newer}
                },
                {
                    "parameter": {"name": "pm25"},
                    "value": 150.0,
                    "unit": "µg/m³",
                    "datetime": {"utc": t_older}
                }
            ]
        })
    )

    provider = OpenAQProvider()
    res = await provider.get_current_air_quality(28.6, 77.2)

    assert "PM2.5" in res.available_pollutants
    # Must retain 210.0 (from newer timestamp), not overwritten by older 150.0
    assert res.available_pollutants["PM2.5"].concentration == 210.0


@pytest.mark.asyncio
@respx.mock
async def test_openaq_rejects_missing_and_malformed_timestamps(monkeypatch):
    """Observations with missing or malformed timestamps MUST be rejected and
    NEVER silently converted into current observations.
    """
    from datetime import datetime, timezone, timedelta
    monkeypatch.setattr(settings, "OPENAQ_API_KEY", "valid_key")

    respx.get(f"{settings.OPENAQ_BASE_URL}/locations").mock(
        return_value=httpx.Response(200, json={
            "results": [{
                "id": 5678,
                "name": "Timestamp Test Station",
                "coordinates": {"latitude": 28.6, "longitude": 77.2}
            }]
        })
    )

    respx.get(f"{settings.OPENAQ_BASE_URL}/locations/5678/latest").mock(
        return_value=httpx.Response(200, json={
            "results": [
                {
                    # Missing timestamp entirely
                    "parameter": {"name": "pm25"},
                    "value": 180.0,
                    "unit": "µg/m³",
                    "datetime": {}
                },
                {
                    # Malformed unparseable timestamp
                    "parameter": {"name": "pm10"},
                    "value": 250.0,
                    "unit": "µg/m³",
                    "datetime": {"utc": "not-a-valid-iso-date"}
                },
                {
                    # Valid timestamp (15 minutes ago)
                    "parameter": {"name": "no2"},
                    "value": 45.0,
                    "unit": "µg/m³",
                    "datetime": {"utc": (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat().replace("+00:00", "Z")}
                }
            ]
        })
    )

    provider = OpenAQProvider()
    res = await provider.get_current_air_quality(28.6, 77.2)

    # Missing and malformed timestamp pollutants must be rejected
    assert "PM2.5" not in res.available_pollutants
    assert "PM10" not in res.available_pollutants
    assert "NO2" in res.available_pollutants
    assert res.available_pollutants["NO2"].concentration == 45.0


@pytest.mark.asyncio
@respx.mock
async def test_openaq_rejects_invalid_measurements(monkeypatch):
    """Negative and malformed concentrations must be rejected specifically by concentration validation
    even when observation timestamp is fresh and valid (distinct from future-timestamp rejection).
    """
    from datetime import datetime, timezone, timedelta
    monkeypatch.setattr(settings, "OPENAQ_API_KEY", "valid_key")

    respx.get(f"{settings.OPENAQ_BASE_URL}/locations").mock(
        return_value=httpx.Response(200, json={
            "results": [{
                "id": 9999,
                "name": "Invalid Measurement Station",
                "coordinates": {"latitude": 28.6, "longitude": 77.2}
            }]
        })
    )

    valid_past_ts = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat().replace("+00:00", "Z")
    respx.get(f"{settings.OPENAQ_BASE_URL}/locations/9999/latest").mock(
        return_value=httpx.Response(200, json={
            "results": [
                {
                    # Severely negative value (sensor error) with a fresh, valid timestamp
                    "parameter": {"name": "pm25"},
                    "value": -99.0,
                    "unit": "µg/m³",
                    "datetime": {"utc": valid_past_ts}
                }
            ]
        })
    )

    provider = OpenAQProvider()
    res = await provider.get_current_air_quality(28.6, 77.2)

    assert "PM2.5" not in res.available_pollutants
    assert res.quality_status == QualityStatus.UNAVAILABLE


@pytest.mark.asyncio
@respx.mock
async def test_openaq_rejects_naive_timestamps(monkeypatch):
    """Observations with naive timestamps (lacking explicit timezone offset)
    must be rejected and excluded, never silently assumed to be UTC or local time.
    Observations with explicit UTC (Z) or explicit offsets (+05:30) must be accepted.
    """
    from datetime import datetime, timezone, timedelta
    monkeypatch.setattr(settings, "OPENAQ_API_KEY", "valid_key")

    respx.get(f"{settings.OPENAQ_BASE_URL}/locations").mock(
        return_value=httpx.Response(200, json={
            "results": [{
                "id": 8888,
                "name": "Timezone Test Station",
                "coordinates": {"latitude": 28.6, "longitude": 77.2}
            }]
        })
    )

    t_now = datetime.now(timezone.utc) - timedelta(minutes=20)
    valid_utc_iso = t_now.isoformat().replace("+00:00", "Z")
    naive_iso = t_now.strftime("%Y-%m-%dT%H:%M:%S")  # No Z, no offset!
    valid_offset_iso = (t_now.astimezone(timezone(timedelta(hours=5, minutes=30)))).isoformat()  # e.g. +05:30

    respx.get(f"{settings.OPENAQ_BASE_URL}/locations/8888/latest").mock(
        return_value=httpx.Response(200, json={
            "results": [
                {
                    # Naive timestamp lacking timezone -> MUST BE REJECTED
                    "parameter": {"name": "pm25"},
                    "value": 140.0,
                    "unit": "µg/m³",
                    "datetime": {"utc": naive_iso}
                },
                {
                    # Explicit UTC timestamp -> MUST BE ACCEPTED
                    "parameter": {"name": "pm10"},
                    "value": 220.0,
                    "unit": "µg/m³",
                    "datetime": {"utc": valid_utc_iso}
                },
                {
                    # Explicit timezone offset (+05:30) -> MUST BE ACCEPTED
                    "parameter": {"name": "no2"},
                    "value": 48.0,
                    "unit": "µg/m³",
                    "datetime": {"local": valid_offset_iso}
                }
            ]
        })
    )

    provider = OpenAQProvider()
    res = await provider.get_current_air_quality(28.6, 77.2)

    # Naive timestamp measurement for PM2.5 must be rejected
    assert "PM2.5" not in res.available_pollutants
    # Valid UTC and explicit offset measurements must be preserved
    assert "PM10" in res.available_pollutants
    assert res.available_pollutants["PM10"].concentration == 220.0
    assert "NO2" in res.available_pollutants
    assert res.available_pollutants["NO2"].concentration == 48.0


@pytest.mark.asyncio
@respx.mock
async def test_openaq_stale_observation_marked_and_warned(monkeypatch):
    """Observations older than 180 minutes must be flagged as STALE with explicit warning."""
    monkeypatch.setattr(settings, "OPENAQ_API_KEY", "valid_key")

    respx.get(f"{settings.OPENAQ_BASE_URL}/locations").mock(
        return_value=httpx.Response(200, json={
            "results": [{
                "id": 1111,
                "name": "Stale Station",
                "coordinates": {"latitude": 28.6, "longitude": 77.2}
            }]
        })
    )

    # 6 hours old timestamp
    stale_iso = "2020-01-01T00:00:00Z"
    respx.get(f"{settings.OPENAQ_BASE_URL}/locations/1111/latest").mock(
        return_value=httpx.Response(200, json={
            "results": [
                {
                    "parameter": {"name": "pm25"},
                    "value": 160.0,
                    "unit": "µg/m³",
                    "datetime": {"utc": stale_iso}
                }
            ]
        })
    )

    provider = OpenAQProvider()
    res = await provider.get_current_air_quality(28.6, 77.2)

    assert res.observation_freshness == FreshnessStatus.STALE
    assert res.observation_age_minutes is not None
    assert res.observation_age_minutes > 180
    assert any("STALE PHYSICAL OBSERVATION WARNING" in lim for lim in res.limitations)


@pytest.mark.asyncio
@respx.mock
async def test_openaq_api_authentication_error(monkeypatch):
    """When OpenAQ returns 401/403, raises ProviderUnavailableError without leaking secret API key."""
    secret_key = "super_confidential_openaq_key_999"
    monkeypatch.setattr(settings, "OPENAQ_API_KEY", secret_key)

    respx.get(f"{settings.OPENAQ_BASE_URL}/locations").mock(
        return_value=httpx.Response(401, text="Unauthorized: Invalid API key")
    )

    provider = OpenAQProvider()
    with pytest.raises(ProviderUnavailableError) as exc_info:
        await provider.get_current_air_quality(28.6, 77.2)

    err_msg = str(exc_info.value)
    assert "HTTP 401" in err_msg
    # Ensure API key is NOT leaked in exception message
    assert secret_key not in err_msg


@pytest.mark.asyncio
@respx.mock
async def test_openaq_rejects_future_dated_observations(monkeypatch):
    """Future-dated observations (> 120s in future) must be rejected and excluded from results."""
    from datetime import datetime, timezone, timedelta
    monkeypatch.setattr(settings, "OPENAQ_API_KEY", "valid_key")

    respx.get(f"{settings.OPENAQ_BASE_URL}/locations").mock(
        return_value=httpx.Response(200, json={
            "results": [{
                "id": 2222,
                "name": "Future Test Station",
                "coordinates": {"latitude": 28.6, "longitude": 77.2}
            }]
        })
    )

    future_time_iso = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    respx.get(f"{settings.OPENAQ_BASE_URL}/locations/2222/latest").mock(
        return_value=httpx.Response(200, json={
            "results": [
                {
                    "parameter": {"name": "pm25"},
                    "value": 175.0,
                    "unit": "µg/m³",
                    "datetime": {"utc": future_time_iso}
                }
            ]
        })
    )

    provider = OpenAQProvider()
    res = await provider.get_current_air_quality(28.6, 77.2)

    # Future-dated observation must be completely excluded
    assert "PM2.5" not in res.available_pollutants
    assert res.observed_at is None
    assert res.quality_status == QualityStatus.UNAVAILABLE
