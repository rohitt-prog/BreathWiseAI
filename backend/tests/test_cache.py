"""Tests for Backend Resilience & In-Memory Telemetry Caching (Phase 7.3)."""
import asyncio
from datetime import datetime, timezone
import pytest
import respx
import httpx
from httpx import AsyncClient

from app.core.config import settings
from app.core.cache import (
    InMemoryCache,
    CacheEntry,
    make_cache_key,
    normalize_coordinate,
    telemetry_cache,
    TTL_CAMS_AIR_QUALITY,
    TTL_WEATHER,
    TTL_FORECAST,
    TTL_OPENAQ_LOCATIONS,
    TTL_OPENAQ_LATEST,
)
from app.services.air_quality_service import AirQualityService
from app.services.weather_service import WeatherService
from app.providers.openaq import OpenAQProvider
from app.schemas.common import DataClassification, FreshnessStatus
from app.core.exceptions import CoordinateValidationError, ProviderUnavailableError


# ============================================================================
# 1. Cache Unit Tests (Clock Manipulation, Keys, Eviction, Expiration)
# ============================================================================

@pytest.mark.asyncio
async def test_cache_miss_and_hit():
    """Verify basic get/set, cache miss, and cache hit."""
    cache = InMemoryCache()
    assert await cache.get("test_key") is None
    stats = cache.get_stats()
    assert stats.misses == 1
    assert stats.hits == 0

    await cache.set("test_key", {"data": 42}, ttl_seconds=60.0)
    res = await cache.get("test_key")
    assert res == {"data": 42}
    stats = cache.get_stats()
    assert stats.hits == 1
    assert stats.misses == 1


@pytest.mark.asyncio
async def test_deterministic_ttl_expiration_with_fake_clock():
    """Verify TTL expiration without real sleep using a deterministic clock provider."""
    fake_time = 1000.0
    cache = InMemoryCache(time_provider=lambda: fake_time)

    await cache.set("short_lived", "alive", ttl_seconds=10.0)
    assert await cache.get("short_lived") == "alive"

    # Advance fake time by 9 seconds -> still valid
    fake_time += 9.0
    assert await cache.get("short_lived") == "alive"

    # Advance fake time by 2 seconds -> expired (total 11s > 10s TTL)
    fake_time += 2.0
    assert await cache.get("short_lived") is None

    stats = cache.get_stats()
    assert stats.expirations == 1


@pytest.mark.asyncio
async def test_prune_expired_entries():
    """Verify pruning expired entries removes stale items from memory."""
    fake_time = 1000.0
    cache = InMemoryCache(time_provider=lambda: fake_time)

    await cache.set("k1", "v1", ttl_seconds=5.0)
    await cache.set("k2", "v2", ttl_seconds=20.0)
    assert cache.size() == 2

    fake_time += 10.0
    pruned = await cache.prune_expired()
    assert pruned == 1
    assert cache.size() == 1
    assert await cache.get("k1") is None
    assert await cache.get("k2") == "v2"


@pytest.mark.asyncio
async def test_lru_eviction_when_capacity_reached():
    """Verify LRU eviction discards the oldest accessed entry when max_size is reached."""
    cache = InMemoryCache(max_size=3)

    await cache.set("k1", "v1", ttl_seconds=60.0)
    await cache.set("k2", "v2", ttl_seconds=60.0)
    await cache.set("k3", "v3", ttl_seconds=60.0)
    assert cache.size() == 3

    # Access k1 to make it most recently used; order of least-used becomes: k2, k3, k1
    await cache.get("k1")

    # Add k4: capacity exceeded, k2 (least recently used) must be evicted
    await cache.set("k4", "v4", ttl_seconds=60.0)
    assert cache.size() == 3
    assert await cache.get("k2") is None  # Evicted
    assert await cache.get("k1") == "v1"
    assert await cache.get("k3") == "v3"
    assert await cache.get("k4") == "v4"

    stats = cache.get_stats()
    assert stats.evictions == 1


@pytest.mark.asyncio
async def test_cache_delete_and_clear():
    """Verify single-key deletion and complete cache clearing."""
    cache = InMemoryCache()
    await cache.set("k1", "v1", ttl_seconds=60.0)
    await cache.set("k2", "v2", ttl_seconds=60.0)

    assert await cache.delete("k1") is True
    assert await cache.delete("k1") is False  # Already gone
    assert await cache.get("k1") is None
    assert await cache.get("k2") == "v2"

    await cache.clear()
    assert cache.size() == 0
    assert await cache.get("k2") is None


def test_cache_key_builder_isolation():
    """Verify deterministic cache keys and isolation across coordinates, domains, and params."""
    # 1. Coordinate normalization (4 decimal places ~ 11 meters)
    k1 = make_cache_key("air_quality", "current", 28.650800001, 77.315200002)
    k2 = make_cache_key("air_quality", "current", 28.6508, 77.3152)
    assert k1 == k2 == "air_quality:current:28.6508:77.3152"

    # 2. Distinct coordinates never collide
    k_delhi = make_cache_key("air_quality", "current", 28.6508, 77.3152)
    k_bengaluru = make_cache_key("air_quality", "current", 12.9716, 77.5946)
    assert k_delhi != k_bengaluru

    # 3. Domain and endpoint isolation
    k_aq = make_cache_key("air_quality", "current", 28.6508, 77.3152)
    k_wx = make_cache_key("weather", "current", 28.6508, 77.3152)
    k_fc = make_cache_key("air_quality", "forecast_full", 28.6508, 77.3152)
    k_openaq = make_cache_key("openaq", "locations", 28.6508, 77.3152)
    assert len({k_aq, k_wx, k_fc, k_openaq}) == 4

    # 4. Deterministic query params
    kp1 = make_cache_key("openaq", "locations", 28.6508, 77.3152, radius=25000, limit=1)
    kp2 = make_cache_key("openaq", "locations", 28.6508, 77.3152, limit=1, radius=25000)
    assert kp1 == kp2
    assert "radius=25000" in kp1


# ============================================================================
# 2. Concurrency & Single-Flight Request Coalescing Tests
# ============================================================================

@pytest.mark.asyncio
async def test_single_flight_coalescing_concurrent_identical_requests():
    """Verify that multiple concurrent identical requests execute upstream fetcher ONLY ONCE."""
    cache = InMemoryCache()
    fetch_count = 0

    async def mock_upstream_fetch():
        nonlocal fetch_count
        fetch_count += 1
        await asyncio.sleep(0.05)  # Simulate network latency
        return {"result": "telemetry_data", "timestamp": "2026-11-19T18:00:00Z"}

    # Launch 5 identical concurrent requests
    results = await asyncio.gather(
        cache.get_or_set("shared_key", 60.0, mock_upstream_fetch),
        cache.get_or_set("shared_key", 60.0, mock_upstream_fetch),
        cache.get_or_set("shared_key", 60.0, mock_upstream_fetch),
        cache.get_or_set("shared_key", 60.0, mock_upstream_fetch),
        cache.get_or_set("shared_key", 60.0, mock_upstream_fetch),
    )

    # All 5 callers receive identical result
    for r in results:
        assert r == {"result": "telemetry_data", "timestamp": "2026-11-19T18:00:00Z"}

    # Crucial assertion: Upstream fetcher was invoked EXACTLY ONCE
    assert fetch_count == 1

    # Check stats: 1 miss (the task initiator), 4 coalesced
    stats = cache.get_stats()
    assert stats.misses == 1
    assert stats.coalesced == 4
    assert cache.in_flight_count() == 0  # In-flight map cleanly emptied


@pytest.mark.asyncio
async def test_concurrent_different_requests_do_not_merge():
    """Verify that concurrent requests for different keys execute independently."""
    cache = InMemoryCache()
    fetch_counts = {"k1": 0, "k2": 0}

    async def fetch_k1():
        fetch_counts["k1"] += 1
        await asyncio.sleep(0.02)
        return "val_k1"

    async def fetch_k2():
        fetch_counts["k2"] += 1
        await asyncio.sleep(0.02)
        return "val_k2"

    r1, r2 = await asyncio.gather(
        cache.get_or_set("key_1", 60.0, fetch_k1),
        cache.get_or_set("key_2", 60.0, fetch_k2),
    )

    assert r1 == "val_k1"
    assert r2 == "val_k2"
    assert fetch_counts["k1"] == 1
    assert fetch_counts["k2"] == 1
    assert cache.get_stats().misses == 2
    assert cache.get_stats().coalesced == 0


@pytest.mark.asyncio
async def test_upstream_failure_does_not_poison_cache():
    """Verify that failed upstream calls are not cached and allow subsequent retries."""
    cache = InMemoryCache()
    call_count = 0

    async def failing_fetch():
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.01)
        raise ProviderUnavailableError(provider="Open-Meteo", message="HTTP 503 Service Unavailable")

    # Concurrent callers all receive the exception
    with pytest.raises(ProviderUnavailableError):
        await asyncio.gather(
            cache.get_or_set("failing_key", 60.0, failing_fetch),
            cache.get_or_set("failing_key", 60.0, failing_fetch),
        )

    # Cache must NOT contain failed key
    assert await cache.get("failing_key") is None
    assert cache.in_flight_count() == 0

    # Subsequent retry succeeds when upstream recovers
    async def recovering_fetch():
        return "recovered_data"

    res = await cache.get_or_set("failing_key", 60.0, recovering_fetch)
    assert res == "recovered_data"
    assert await cache.get("failing_key") == "recovered_data"


@pytest.mark.asyncio
async def test_waiting_client_cancellation_does_not_abort_shared_fetch():
    """Verify that if one waiting caller is cancelled, shared work continues for other callers."""
    cache = InMemoryCache()
    fetch_executed = False

    async def slow_fetch():
        nonlocal fetch_executed
        await asyncio.sleep(0.08)
        fetch_executed = True
        return "shared_value"

    # Start request 1 (task initiator) and request 2 (waiting coalesced caller)
    t1 = asyncio.create_task(cache.get_or_set("cancel_key", 60.0, slow_fetch))
    t2 = asyncio.create_task(cache.get_or_set("cancel_key", 60.0, slow_fetch))

    # Give both tasks time to register in-flight
    await asyncio.sleep(0.01)

    # Cancel task 2 (simulating client disconnect)
    t2.cancel()

    # Task 2 raises CancelledError
    with pytest.raises(asyncio.CancelledError):
        await t2

    # Task 1 must complete successfully
    res1 = await t1
    assert res1 == "shared_value"
    assert fetch_executed is True

    # Cache should be populated for subsequent callers
    assert await cache.get("cancel_key") == "shared_value"


@pytest.mark.asyncio
async def test_all_waiting_callers_cancelled_background_task_exception_consumed():
    """Verify that when all waiting callers cancel, a failing background task's exception
    is safely consumed without an unretrieved-task warning, in-flight state is cleaned up,
    no cache entry is stored, and subsequent retries succeed."""
    cache = InMemoryCache()

    # Step 1: Start a shared fetch using a controllable async fetcher
    fetch_started = asyncio.Event()
    release_fetch = asyncio.Event()
    upstream_call_count = 0

    async def controllable_failing_fetch():
        nonlocal upstream_call_count
        upstream_call_count += 1
        fetch_started.set()
        await release_fetch.wait()
        raise ProviderUnavailableError(provider="Open-Meteo", message="Controlled 503 error")

    # Step 2: Attach multiple waiting callers
    caller1 = asyncio.create_task(cache.get_or_set("cancel_all_key", 60.0, controllable_failing_fetch))
    caller2 = asyncio.create_task(cache.get_or_set("cancel_all_key", 60.0, controllable_failing_fetch))

    # Deterministically wait until upstream fetch has started
    await fetch_started.wait()
    assert cache.in_flight_count() == 1

    # Step 3: Cancel all waiting callers
    caller1.cancel()
    caller2.cancel()

    for caller in [caller1, caller2]:
        with pytest.raises(asyncio.CancelledError):
            await caller

    # Step 4 & 5: Allow the background fetch to continue and raise its controlled exception
    release_fetch.set()

    # Deterministically wait until the background task completes execution and cleanup
    while cache.in_flight_count() > 0:
        await asyncio.sleep(0.001)

    # Step 6: Verify exception was consumed cleanly (verified by pytest's unhandled warning check)
    # Step 7: Verify the in-flight entry is cleaned up
    assert cache.in_flight_count() == 0

    # Step 8: Verify no cache entry exists for the failed request
    assert await cache.get("cancel_all_key") is None

    # Step 9 & 10: Issue another request for the same key and verify fresh retry succeeds
    retry_executed = False

    async def successful_retry_fetch():
        nonlocal retry_executed
        retry_executed = True
        return "retry_success_data"

    retry_res = await cache.get_or_set("cancel_all_key", 60.0, successful_retry_fetch)
    assert retry_res == "retry_success_data"
    assert retry_executed is True
    assert upstream_call_count == 1  # Original failed fetch was called once; retry was independent
    assert await cache.get("cancel_all_key") == "retry_success_data"


# ============================================================================
# 3. Integration Tests: Air Quality, Weather, and Forecast Services
# ============================================================================

@pytest.mark.asyncio
@respx.mock
async def test_air_quality_service_caching_and_provenance_preservation(mock_open_meteo_aqi_payload):
    """Verify AirQualityService caches responses while preserving exact timestamps and provenance."""
    route = respx.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_aqi_payload)
    )

    service = AirQualityService()

    # 1. First call: Cache miss -> queries upstream
    res1 = await service.get_current_air_quality(28.6508, 77.3152)
    assert route.call_count == 1
    assert res1.source_type == DataClassification.MODELLED_FORECAST
    assert res1.retrieved_at is not None
    original_retrieved_at = res1.retrieved_at
    original_forecast_ts = res1.forecast_timestamp

    # 2. Second call with same coordinates: Cache hit -> zero additional upstream calls
    res2 = await service.get_current_air_quality(28.6508, 77.3152)
    assert route.call_count == 1  # Not incremented!
    assert res2.source_type == DataClassification.MODELLED_FORECAST

    # 3. Crucial Provenance & Timestamp Integrity: Must NOT reset timestamps
    assert res2.retrieved_at == original_retrieved_at
    assert res2.forecast_timestamp == original_forecast_ts
    assert res2.observed_at is None
    assert res2.provider == "Open-Meteo CAMS Air Quality Forecast"
    assert res2.available_pollutants["PM2.5"].concentration == 142.5

    # 4. Deepcopy isolation: mutating res2 does not affect cached object
    res2.available_pollutants["PM2.5"].concentration = 999.9
    res3 = await service.get_current_air_quality(28.6508, 77.3152)
    assert res3.available_pollutants["PM2.5"].concentration == 142.5


@pytest.mark.asyncio
@respx.mock
async def test_weather_service_caching_and_coordination(mock_open_meteo_weather_payload):
    """Verify WeatherService caches meteorological & boundary layer data."""
    route = respx.get(settings.OPEN_METEO_WEATHER_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_weather_payload)
    )

    service = WeatherService()

    # First call: miss
    w1 = await service.get_current_weather(28.6508, 77.3152)
    assert route.call_count == 1
    assert w1.temperature_c == 18.5
    assert w1.boundary_layer_height_meters == 210.0
    original_retrieved_at = w1.retrieved_at

    # Second call: hit
    w2 = await service.get_current_weather(28.6508, 77.3152)
    assert route.call_count == 1  # Upstream not called
    assert w2.temperature_c == 18.5
    assert w2.retrieved_at == original_retrieved_at


@pytest.mark.asyncio
@respx.mock
async def test_air_quality_forecast_full_array_caching(mock_open_meteo_aqi_payload):
    """Verify that hourly forecast requests share the cached 48h array regardless of hours slice."""
    route = respx.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_aqi_payload)
    )

    service = AirQualityService()

    # Request 1: hours=24
    fc1 = await service.get_air_quality_forecast(28.6508, 77.3152, hours=2)
    assert route.call_count == 1
    assert len(fc1.hourly_forecast) == 2

    # Request 2: hours=None (full array) -> Cache hit
    fc2 = await service.get_air_quality_forecast(28.6508, 77.3152, hours=None)
    assert route.call_count == 1
    assert len(fc2.hourly_forecast) == 3  # Mock payload has 3 points


@pytest.mark.asyncio
@respx.mock
async def test_openaq_locations_discovery_caching(
    monkeypatch,
    mock_openaq_locations_payload,
    mock_openaq_latest_payload
):
    """Verify OpenAQ v3 station discovery caching when API key is configured."""
    monkeypatch.setattr(settings, "OPENAQ_API_KEY", "test-key-openaq")

    loc_route = respx.get(f"{settings.OPENAQ_BASE_URL}/locations").mock(
        return_value=httpx.Response(200, json=mock_openaq_locations_payload)
    )
    latest_route = respx.get(f"{settings.OPENAQ_BASE_URL}/locations/9845/latest").mock(
        return_value=httpx.Response(200, json=mock_openaq_latest_payload)
    )

    provider = OpenAQProvider()

    # First call: queries /locations and /latest
    res1 = await provider.get_current_air_quality(28.6508, 77.3152)
    assert loc_route.call_count == 1
    assert latest_route.call_count == 1
    assert "Anand Vihar Monitor Node" in res1.location.name

    # Second call directly on provider: /locations discovery hits cache!
    res2 = await provider.get_current_air_quality(28.6508, 77.3152)
    assert loc_route.call_count == 1  # /locations was served from cache!
    assert latest_route.call_count == 2


@pytest.mark.asyncio
async def test_invalid_coordinates_rejected_before_cache_access():
    """Verify invalid coordinates raise CoordinateValidationError before touching cache."""
    service = AirQualityService()
    initial_stats = telemetry_cache.get_stats()

    with pytest.raises(CoordinateValidationError):
        await service.get_current_air_quality(999.0, 77.3152)

    with pytest.raises(CoordinateValidationError):
        await service.get_air_quality_forecast(28.6508, -200.0)

    # Zero cache interactions occurred
    post_stats = telemetry_cache.get_stats()
    assert post_stats.misses == initial_stats.misses
    assert post_stats.hits == initial_stats.hits


@pytest.mark.asyncio
@respx.mock
async def test_api_endpoint_air_quality_cache_hit(async_client: AsyncClient, mock_open_meteo_aqi_payload):
    """Verify GET /api/v1/air-quality/current hits cache on subsequent requests."""
    route = respx.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_aqi_payload)
    )

    # First request: upstream queried
    r1 = await async_client.get("/api/v1/air-quality/current?latitude=28.6508&longitude=77.3152")
    assert r1.status_code == 200
    assert route.call_count == 1

    # Second request: served from cache
    r2 = await async_client.get("/api/v1/air-quality/current?latitude=28.6508&longitude=77.3152")
    assert r2.status_code == 200
    assert route.call_count == 1  # Not incremented!
    assert r2.json() == r1.json()

    # Different location: queries upstream
    r3 = await async_client.get("/api/v1/air-quality/current?latitude=12.9716&longitude=77.5946")
    assert r3.status_code == 200
    assert route.call_count == 2


@pytest.mark.asyncio
@respx.mock
async def test_api_endpoint_weather_cache_hit(async_client: AsyncClient, mock_open_meteo_weather_payload):
    """Verify GET /api/v1/weather/current hits cache on subsequent requests."""
    route = respx.get(settings.OPEN_METEO_WEATHER_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_weather_payload)
    )

    r1 = await async_client.get("/api/v1/weather/current?latitude=28.6508&longitude=77.3152")
    assert r1.status_code == 200
    assert route.call_count == 1

    r2 = await async_client.get("/api/v1/weather/current?latitude=28.6508&longitude=77.3152")
    assert r2.status_code == 200
    assert route.call_count == 1  # Served from cache!
    assert r2.json() == r1.json()


@pytest.mark.asyncio
@respx.mock
async def test_ai_insights_endpoint_reuses_cached_telemetry(
    async_client: AsyncClient,
    mock_open_meteo_aqi_payload,
    mock_open_meteo_weather_payload
):
    """Verify POST /api/v1/ai/insights reuses telemetry cached by air quality and weather requests."""
    aq_route = respx.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_aqi_payload)
    )
    wx_route = respx.get(settings.OPEN_METEO_WEATHER_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_weather_payload)
    )

    # 1. Dashboard queries air-quality and weather
    await async_client.get("/api/v1/air-quality/current?latitude=28.6508&longitude=77.3152")
    await async_client.get("/api/v1/weather/current?latitude=28.6508&longitude=77.3152")
    assert aq_route.call_count == 1
    assert wx_route.call_count == 1

    # 2. AI insights for same coordinates should reuse cached telemetry without calling upstream
    ai_resp = await async_client.post(
        "/api/v1/ai/insights",
        json={"latitude": 28.6508, "longitude": 77.3152, "activity_context": "GENERAL"}
    )
    assert ai_resp.status_code == 200
    # Crucial assertion: Upstream routes were NOT called again!
    assert aq_route.call_count == 1
    assert wx_route.call_count == 1
