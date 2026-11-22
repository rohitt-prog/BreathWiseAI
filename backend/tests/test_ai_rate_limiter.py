"""Tests for AI Insights Endpoint Rate Limiting and Abuse Protection.

Covers:
1. Requests below the limit are accepted.
2. Requests at the configured boundary behave correctly.
3. Requests exceeding the limit receive HTTP 429 and Retry-After header.
4. Rate limit state resets after the window expires.
5. Different client IPs have independent limits.
6. Missing or invalid client IP handling is safe (no crash, safe attribution).
7. Concurrent requests cannot bypass the limit through race conditions.
8. Existing AI endpoint behavior remains intact when not rate-limited.
9. Rate-limiting responses contain no sensitive internal information.
10. Spoofed X-Forwarded-For headers cannot bypass rate limits by default.
11. Bounded memory eviction protects against memory exhaustion.
"""
import asyncio
import math
import pytest
from httpx import AsyncClient, ASGITransport
import respx
import httpx

from app.main import app
from app.core.config import settings
from app.core.rate_limiter import ai_rate_limiter, SlidingWindowRateLimiter, extract_client_ip
from app.core.exceptions import RateLimitExceededError


@pytest.fixture
def mock_open_meteo_air_quality():
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
def mock_open_meteo_weather():
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


class ControllableClock:
    """Deterministic monotonic clock provider for reproducible rate limiting tests."""
    def __init__(self, start_time: float = 1000.0):
        self.current_time = start_time

    def __call__(self) -> float:
        return self.current_time

    def advance(self, seconds: float) -> None:
        self.current_time += seconds


# ==============================================================================
# 1. Requests below the limit are accepted
# 2. Requests at the configured boundary behave correctly
# 3. Requests exceeding the limit receive HTTP 429
# ==============================================================================

@pytest.mark.asyncio
async def test_rate_limiting_boundary_and_exceeded(
    mock_open_meteo_air_quality,
    mock_open_meteo_weather
):
    """Verify that requests 1-9 succeed, request 10 (boundary) succeeds, and request 11 receives 429."""
    clock = ControllableClock(start_time=100.0)
    ai_rate_limiter.set_time_provider(clock)
    ai_rate_limiter.configure(max_requests=10, window_seconds=60, enabled=True)

    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_air_quality)
        )
        respx_mock.get(settings.OPEN_METEO_WEATHER_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_weather)
        )

        transport = ASGITransport(app=app, client=("192.168.1.10", 50000))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {"latitude": 28.65, "longitude": 77.25, "activity_context": "GENERAL"}

            # Requests 1 to 9 (below limit)
            for req_idx in range(1, 10):
                res = await client.post("/api/v1/ai/insights", json=payload)
                assert res.status_code == 200, f"Request {req_idx} failed with {res.status_code}"
                clock.advance(1.0)

            # Request 10 (at exact boundary)
            res_10 = await client.post("/api/v1/ai/insights", json=payload)
            assert res_10.status_code == 200, f"Boundary request 10 failed with {res_10.status_code}"

            # Request 11 (exceeds limit: 11 requests within 60s)
            res_11 = await client.post("/api/v1/ai/insights", json=payload)
            assert res_11.status_code == 429
            assert "Retry-After" in res_11.headers

            retry_after = int(res_11.headers["Retry-After"])
            assert retry_after > 0
            assert retry_after <= 60

            body = res_11.json()
            assert body["error"] == "RateLimitExceededError"
            assert body["status_code"] == 429
            assert "details" in body
            assert body["details"]["limit"] == 10
            assert body["details"]["window_seconds"] == 60


# ==============================================================================
# 4. Rate limit state resets after the window expires
# ==============================================================================

@pytest.mark.asyncio
async def test_rate_limit_resets_after_window_expires(
    mock_open_meteo_air_quality,
    mock_open_meteo_weather
):
    """Verify that after the 60-second window expires, client IP can make requests again."""
    clock = ControllableClock(start_time=500.0)
    ai_rate_limiter.set_time_provider(clock)
    ai_rate_limiter.configure(max_requests=5, window_seconds=60, enabled=True)

    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_air_quality)
        )
        respx_mock.get(settings.OPEN_METEO_WEATHER_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_weather)
        )

        transport = ASGITransport(app=app, client=("192.168.1.20", 50000))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {"latitude": 28.65, "longitude": 77.25, "activity_context": "OUTDOOR_EXERCISE"}

            # Send 5 requests at t=500, filling the limit
            for _ in range(5):
                res = await client.post("/api/v1/ai/insights", json=payload)
                assert res.status_code == 200
                clock.advance(0.5)

            # 6th request at t=502.5 exceeds limit
            res_blocked = await client.post("/api/v1/ai/insights", json=payload)
            assert res_blocked.status_code == 429

            # Advance clock past the window (60 seconds)
            clock.advance(61.0)  # t=563.5, all initial requests are now expired

            # New request succeeds
            res_recovered = await client.post("/api/v1/ai/insights", json=payload)
            assert res_recovered.status_code == 200


# ==============================================================================
# 5. Different client IPs have independent limits
# ==============================================================================

@pytest.mark.asyncio
async def test_independent_rate_limits_per_ip(
    mock_open_meteo_air_quality,
    mock_open_meteo_weather
):
    """Verify that exhausting the limit on IP A does not affect IP B."""
    clock = ControllableClock(start_time=100.0)
    ai_rate_limiter.set_time_provider(clock)
    ai_rate_limiter.configure(max_requests=3, window_seconds=60, enabled=True)

    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_air_quality)
        )
        respx_mock.get(settings.OPEN_METEO_WEATHER_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_weather)
        )

        transport_a = ASGITransport(app=app, client=("10.0.0.1", 50000))
        transport_b = ASGITransport(app=app, client=("10.0.0.2", 50000))
        payload = {"latitude": 28.65, "longitude": 77.25, "activity_context": "GENERAL"}

        async with AsyncClient(transport=transport_a, base_url="http://test") as client_a:
            async with AsyncClient(transport=transport_b, base_url="http://test") as client_b:
                # Client A sends 3 requests (hits limit)
                for _ in range(3):
                    res = await client_a.post("/api/v1/ai/insights", json=payload)
                    assert res.status_code == 200

                # Client A 4th request is blocked
                res_a_blocked = await client_a.post("/api/v1/ai/insights", json=payload)
                assert res_a_blocked.status_code == 429

                # Client B should NOT be blocked
                res_b_1 = await client_b.post("/api/v1/ai/insights", json=payload)
                assert res_b_1.status_code == 200
                res_b_2 = await client_b.post("/api/v1/ai/insights", json=payload)
                assert res_b_2.status_code == 200


# ==============================================================================
# 6. Missing or invalid client IP handling is safe
# ==============================================================================

def test_missing_client_ip_safe_handling():
    """Verify that extract_client_ip safely returns fallback without crashing when request.client is None."""
    from unittest.mock import MagicMock
    mock_req = MagicMock()
    mock_req.client = None
    mock_req.headers = {}

    ip = extract_client_ip(mock_req)
    assert ip == "unknown_client"

    # With empty client.host
    mock_req.client = MagicMock()
    mock_req.client.host = ""
    ip_empty = extract_client_ip(mock_req)
    assert ip_empty == "unknown_client"


# ==============================================================================
# 7. Concurrent requests cannot bypass the limit through race conditions
# ==============================================================================

@pytest.mark.asyncio
async def test_concurrent_requests_race_condition_protection(
    mock_open_meteo_air_quality,
    mock_open_meteo_weather
):
    """Verify that concurrent requests hitting the endpoint simultaneously strictly obey the limit."""
    clock = ControllableClock(start_time=200.0)
    ai_rate_limiter.set_time_provider(clock)
    ai_rate_limiter.configure(max_requests=5, window_seconds=60, enabled=True)

    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_air_quality)
        )
        respx_mock.get(settings.OPEN_METEO_WEATHER_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_weather)
        )

        transport = ASGITransport(app=app, client=("172.16.0.5", 50000))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {"latitude": 28.65, "longitude": 77.25, "activity_context": "OUTDOOR_EXERCISE"}

            # Fire 15 simultaneous requests
            tasks = [client.post("/api/v1/ai/insights", json=payload) for _ in range(15)]
            responses = await asyncio.gather(*tasks)

            status_codes = [r.status_code for r in responses]
            success_count = status_codes.count(200)
            throttled_count = status_codes.count(429)

            assert success_count == 5, f"Expected exactly 5 successes, got {success_count}"
            assert throttled_count == 10, f"Expected exactly 10 throttled, got {throttled_count}"


# ==============================================================================
# 8. Existing AI endpoint behavior remains intact when not rate-limited
# ==============================================================================

@pytest.mark.asyncio
async def test_existing_ai_endpoint_behavior_intact(
    mock_open_meteo_air_quality,
    mock_open_meteo_weather
):
    """Verify normal AI endpoint functionality (telemetry, response format, validation) works when not throttled."""
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_air_quality)
        )
        respx_mock.get(settings.OPEN_METEO_WEATHER_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_weather)
        )

        transport = ASGITransport(app=app, client=("192.168.1.50", 50000))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Normal request
            res = await client.post(
                "/api/v1/ai/insights",
                json={"latitude": 28.65, "longitude": 77.25, "activity_context": "COMMUTE"}
            )
            assert res.status_code == 200
            data = res.json()
            assert data["activity_context"] == "COMMUTE"
            assert "recommended_actions" in data
            assert len(data["recommended_actions"]) >= 1

            # 2. Schema validation error (422) still works
            res_val = await client.post(
                "/api/v1/ai/insights",
                json={"latitude": 28.65, "longitude": 77.25, "activity_context": "NON_EXISTENT_CONTEXT"}
            )
            assert res_val.status_code == 422


# ==============================================================================
# 9. Rate-limiting responses contain no sensitive internal information
# ==============================================================================

@pytest.mark.asyncio
async def test_rate_limiting_response_sanitization(
    mock_open_meteo_air_quality,
    mock_open_meteo_weather
):
    """Verify that 429 response body contains only expected fields and zero internal server secrets."""
    clock = ControllableClock(start_time=100.0)
    ai_rate_limiter.set_time_provider(clock)
    ai_rate_limiter.configure(max_requests=1, window_seconds=60, enabled=True)

    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_air_quality)
        )
        respx_mock.get(settings.OPEN_METEO_WEATHER_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_weather)
        )

        transport = ASGITransport(app=app, client=("192.168.1.99", 50000))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {"latitude": 28.65, "longitude": 77.25}

            # First request succeeds
            await client.post("/api/v1/ai/insights", json=payload)

            # Second request throttled
            res = await client.post("/api/v1/ai/insights", json=payload)
            assert res.status_code == 429

            body = res.json()
            # Allowed standard error keys only
            allowed_keys = {"error", "message", "status_code", "details", "timestamp"}
            assert set(body.keys()) == allowed_keys

            # Details contain only public rate-limiting parameters
            allowed_details_keys = {"retry_after", "limit", "window_seconds"}
            assert set(body["details"].keys()) == allowed_details_keys

            # Check that no path, traceback, or config leaked
            raw_text = res.text.lower()
            assert "traceback" not in raw_text
            assert "python" not in raw_text
            assert "users/" not in raw_text
            assert "gemini" not in raw_text
            assert "key" not in raw_text


# ==============================================================================
# 10. Spoofed X-Forwarded-For headers cannot bypass rate limits by default
# ==============================================================================

@pytest.mark.asyncio
async def test_spoofed_x_forwarded_for_cannot_bypass_limit(
    mock_open_meteo_air_quality,
    mock_open_meteo_weather
):
    """Verify that by default, setting X-Forwarded-For to a spoofed IP is ignored."""
    clock = ControllableClock(start_time=100.0)
    ai_rate_limiter.set_time_provider(clock)
    ai_rate_limiter.configure(max_requests=2, window_seconds=60, enabled=True, trust_proxy_headers=False)

    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_air_quality)
        )
        respx_mock.get(settings.OPEN_METEO_WEATHER_URL).mock(
            return_value=httpx.Response(200, json=mock_open_meteo_weather)
        )

        transport = ASGITransport(app=app, client=("192.168.1.100", 50000))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {"latitude": 28.65, "longitude": 77.25}

            # Request 1 with spoofed header
            res1 = await client.post(
                "/api/v1/ai/insights",
                json=payload,
                headers={"X-Forwarded-For": "203.0.113.1"}
            )
            assert res1.status_code == 200

            # Request 2 with different spoofed header
            res2 = await client.post(
                "/api/v1/ai/insights",
                json=payload,
                headers={"X-Forwarded-For": "203.0.113.2"}
            )
            assert res2.status_code == 200

            # Request 3 with yet another spoofed header — MUST BE BLOCKED because direct IP is 192.168.1.100
            res3 = await client.post(
                "/api/v1/ai/insights",
                json=payload,
                headers={"X-Forwarded-For": "203.0.113.3"}
            )
            assert res3.status_code == 429


# ==============================================================================
# 11. Bounded memory eviction protects against memory exhaustion
# ==============================================================================

@pytest.mark.asyncio
async def test_bounded_memory_eviction():
    """Verify that rate limiter evicts stale/old entries when max_tracked_clients is exceeded."""
    clock = ControllableClock(start_time=1000.0)
    limiter = SlidingWindowRateLimiter(
        max_requests=5,
        window_seconds=60,
        max_tracked_clients=3,
        time_provider=clock
    )

    from unittest.mock import MagicMock

    def make_mock_req(ip: str):
        req = MagicMock()
        req.client = MagicMock()
        req.client.host = ip
        req.url.path = "/api/v1/ai/insights"
        req.headers = {}
        return req

    # Add 3 clients
    await limiter.check_rate_limit(make_mock_req("1.1.1.1"))
    await limiter.check_rate_limit(make_mock_req("2.2.2.2"))
    await limiter.check_rate_limit(make_mock_req("3.3.3.3"))
    assert await limiter.get_tracked_client_count() == 3

    # Advance time past 60s so all existing entries become stale
    clock.advance(70.0)

    # Add 4th client - should trigger prune and keep tracked count bounded <= 3
    await limiter.check_rate_limit(make_mock_req("4.4.4.4"))
    assert await limiter.get_tracked_client_count() <= 3
