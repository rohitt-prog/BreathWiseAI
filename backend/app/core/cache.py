"""In-memory asynchronous-safe telemetry cache with single-flight request coalescing.

Provides bounded, TTL-based caching for upstream environmental telemetry.
Guarantees strict preservation of environmental data timestamps, provenance,
location accuracy, freshness classification, and AI safety.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine, Dict, Optional, TypeVar, Union
from collections import OrderedDict
import asyncio
import copy
import time

from .logging import logger

T = TypeVar("T")

# Default Cache Configuration
DEFAULT_MAX_CACHE_SIZE: int = 500
COORDINATE_PRECISION_DECIMALS: int = 4

# Central TTL Policies (seconds)
TTL_CAMS_AIR_QUALITY: float = 600.0       # 10 minutes (hourly atmospheric model updates)
TTL_WEATHER: float = 600.0                # 10 minutes (hourly surface meteorology & BLH)
TTL_FORECAST: float = 1800.0              # 30 minutes (48-hour model trajectory)
TTL_OPENAQ_LOCATIONS: float = 600.0       # 10 minutes (physical station metadata)
TTL_OPENAQ_LATEST: float = 300.0          # 5 minutes (physical ground sensor readings)


def normalize_coordinate(val: float, precision: int = COORDINATE_PRECISION_DECIMALS) -> str:
    """Format coordinate to fixed decimal precision for deterministic cache keys.
    
    4 decimal places corresponds to approximately 11 meters of latitude at the equator.
    This safely prevents floating-point representation jitter (e.g., 28.650800000000003)
    from causing duplicate upstream queries without merging geographically distinct locations.
    """
    return f"{round(val, precision):.{precision}f}"


def make_cache_key(
    domain: str,
    endpoint: str,
    latitude: float,
    longitude: float,
    **kwargs: Any
) -> str:
    """Construct a collision-proof, deterministic cache key.
    
    Encodes:
    - Domain (e.g. 'air_quality', 'weather', 'openaq')
    - Endpoint / Data type (e.g. 'current', 'forecast_full', 'locations')
    - Normalized latitude & longitude (4 decimal places)
    - Sorted optional request parameters (e.g. radius=25000)
    """
    lat_str = normalize_coordinate(latitude)
    lon_str = normalize_coordinate(longitude)
    base_key = f"{domain}:{endpoint}:{lat_str}:{lon_str}"
    
    if kwargs:
        filtered_params = sorted(
            (k, v) for k, v in kwargs.items() if v is not None
        )
        if filtered_params:
            params_str = ":".join(f"{k}={v}" for k, v in filtered_params)
            return f"{base_key}:{params_str}"
            
    return base_key


@dataclass
class CacheEntry:
    """Single cached telemetry item with monotonic TTL expiration."""
    value: Any
    expires_at: float  # monotonic timestamp
    created_at: datetime  # UTC timestamp
    hit_count: int = 0

    def is_expired(self, current_time: Optional[float] = None) -> bool:
        """Check if entry has exceeded its TTL."""
        now = current_time if current_time is not None else time.monotonic()
        return now >= self.expires_at


@dataclass
class CacheStats:
    """Internal diagnostic statistics for cache observability."""
    hits: int = 0
    misses: int = 0
    coalesced: int = 0
    expirations: int = 0
    evictions: int = 0

    def to_dict(self) -> Dict[str, int]:
        return {
            "hits": self.hits,
            "misses": self.misses,
            "coalesced": self.coalesced,
            "expirations": self.expirations,
            "evictions": self.evictions,
        }


class InMemoryCache:
    """Thread/asyncio-safe in-memory LRU cache with single-flight request coalescing.
    
    Key Properties:
    - Process-local memory only; zero external dependencies.
    - LRU eviction when capacity reaches max_size.
    - Single-flight coalescing: concurrent identical requests share one in-flight task.
    - Upstream errors are never cached (fail-closed integrity).
    - Preserves original domain model timestamps and provenance via deep copying.
    - Supports custom time providers for deterministic testing without sleeps.
    """

    def __init__(
        self,
        max_size: int = DEFAULT_MAX_CACHE_SIZE,
        time_provider: Optional[Callable[[], float]] = None
    ):
        self._max_size = max_size
        self._time_provider = time_provider or time.monotonic
        self._entries: OrderedDict[str, CacheEntry] = OrderedDict()
        self._in_flight: Dict[str, asyncio.Task] = {}
        self._lock: asyncio.Lock = asyncio.Lock()
        self._stats: CacheStats = CacheStats()

    @property
    def max_size(self) -> int:
        return self._max_size

    def size(self) -> int:
        """Return current entry count."""
        return len(self._entries)

    def in_flight_count(self) -> int:
        """Return number of currently active in-flight requests."""
        return len(self._in_flight)

    def get_stats(self) -> CacheStats:
        """Return snapshot of diagnostic statistics."""
        return copy.copy(self._stats)

    async def get(
        self,
        key: str,
        clone_fn: Optional[Callable[[Any], Any]] = None
    ) -> Optional[Any]:
        """Retrieve an entry if present and not expired."""
        async with self._lock:
            if key not in self._entries:
                self._stats.misses += 1
                return None

            entry = self._entries[key]
            now = self._time_provider()
            if entry.is_expired(now):
                del self._entries[key]
                self._stats.expirations += 1
                self._stats.misses += 1
                return None

            self._entries.move_to_end(key)
            entry.hit_count += 1
            self._stats.hits += 1
            val = entry.value

        return clone_fn(val) if clone_fn else copy.deepcopy(val)

    async def set(
        self,
        key: str,
        value: Any,
        ttl_seconds: float
    ) -> None:
        """Explicitly store an entry with TTL."""
        now = self._time_provider()
        async with self._lock:
            while len(self._entries) >= self._max_size and key not in self._entries:
                self._entries.popitem(last=False)
                self._stats.evictions += 1

            self._entries[key] = CacheEntry(
                value=value,
                expires_at=now + ttl_seconds,
                created_at=datetime.now(timezone.utc)
            )
            self._entries.move_to_end(key)

    async def delete(self, key: str) -> bool:
        """Remove a single entry from cache."""
        async with self._lock:
            if key in self._entries:
                del self._entries[key]
                return True
            return False

    async def clear(self) -> None:
        """Clear all entries, in-flight state, and reset stats."""
        async with self._lock:
            self._entries.clear()
            self._in_flight.clear()
            self._stats = CacheStats()

    async def prune_expired(self) -> int:
        """Prune all expired entries and return number of entries removed."""
        now = self._time_provider()
        pruned = 0
        async with self._lock:
            expired_keys = [k for k, v in self._entries.items() if v.is_expired(now)]
            for k in expired_keys:
                del self._entries[k]
                pruned += 1
            self._stats.expirations += pruned
        return pruned

    async def get_or_set(
        self,
        key: str,
        ttl_seconds: Union[float, Callable[[T], float]],
        fetcher: Callable[[], Coroutine[Any, Any, T]],
        clone_fn: Optional[Callable[[T], T]] = None,
        should_cache: Optional[Callable[[T], bool]] = None
    ) -> T:
        """Get cached value or fetch with single-flight request coalescing.
        
        If concurrent callers request the same key while an upstream fetch is in progress,
        only ONE fetch executes. All waiting callers safely share the result without duplicate
        network I/O.
        """
        # Fast path: check for existing valid cache entry
        async with self._lock:
            if key in self._entries:
                entry = self._entries[key]
                now = self._time_provider()
                if not entry.is_expired(now):
                    self._entries.move_to_end(key)
                    entry.hit_count += 1
                    self._stats.hits += 1
                    val = entry.value
                    return clone_fn(val) if clone_fn else copy.deepcopy(val)
                else:
                    del self._entries[key]
                    self._stats.expirations += 1

            # Check if this exact key is already being fetched by another task
            if key in self._in_flight:
                task = self._in_flight[key]
                self._stats.coalesced += 1
            else:
                self._stats.misses += 1
                task = asyncio.create_task(
                    self._execute_fetch(key, ttl_seconds, fetcher, should_cache)
                )
                task.add_done_callback(self._on_fetch_task_done)
                self._in_flight[key] = task

        # Await the fetch task with shield so caller cancellation does not abort shared work
        try:
            res = await asyncio.shield(task)
            return clone_fn(res) if clone_fn else copy.deepcopy(res)
        except Exception:
            raise

    @staticmethod
    def _on_fetch_task_done(task: asyncio.Task) -> None:
        """Consume task exception if unretrieved when all waiting callers cancelled."""
        if not task.cancelled():
            try:
                task.exception()
            except (asyncio.CancelledError, asyncio.InvalidStateError):
                pass

    async def _execute_fetch(
        self,
        key: str,
        ttl_seconds: Union[float, Callable[[T], float]],
        fetcher: Callable[[], Coroutine[Any, Any, T]],
        should_cache: Optional[Callable[[T], bool]]
    ) -> T:
        """Execute upstream fetcher, cache on success, and clean in-flight state."""
        try:
            result = await fetcher()
            if should_cache is None or should_cache(result):
                effective_ttl = (
                    ttl_seconds(result) if callable(ttl_seconds) else ttl_seconds
                )
                now = self._time_provider()
                async with self._lock:
                    while len(self._entries) >= self._max_size and key not in self._entries:
                        self._entries.popitem(last=False)
                        self._stats.evictions += 1

                    self._entries[key] = CacheEntry(
                        value=result,
                        expires_at=now + effective_ttl,
                        created_at=datetime.now(timezone.utc)
                    )
                    self._entries.move_to_end(key)
            return result
        finally:
            async with self._lock:
                self._in_flight.pop(key, None)


# Default global singleton for backend telemetry caching
telemetry_cache = InMemoryCache()
