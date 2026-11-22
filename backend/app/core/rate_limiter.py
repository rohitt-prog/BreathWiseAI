"""In-memory sliding-window log rate limiter for expensive AI endpoints.

Provides process-local, thread/asyncio-safe rate limiting with bounded memory usage,
deterministic clock control for testing, and safe client IP extraction.
"""
from collections import OrderedDict
import asyncio
import math
import time
from typing import Any, Callable, Dict, List, Optional
from fastapi import Request

from .config import settings
from .exceptions import RateLimitExceededError
from .logging import logger


def extract_client_ip(
    request: Request,
    trust_proxy_headers: bool = False,
    trusted_proxies: Optional[List[str]] = None
) -> str:
    """Extract client IP address safely without trusting unverified proxy headers.

    Security Boundaries:
    - By default (trust_proxy_headers=False), strictly uses request.client.host (peer socket address).
    - Client-supplied X-Forwarded-For headers are completely ignored by default to prevent spoofing.
    - If request.client is None or empty, returns 'unknown_client'.
    - If proxy headers are explicitly enabled, X-Forwarded-For is only consulted if the direct peer
      matches trusted_proxies (when trusted_proxies list is provided).
    """
    direct_ip = request.client.host if request.client and request.client.host else "unknown_client"

    if not trust_proxy_headers:
        return direct_ip

    if trusted_proxies and direct_ip not in trusted_proxies:
        return direct_ip

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if parts:
            return parts[0]

    return direct_ip


class SlidingWindowRateLimiter:
    """Thread/asyncio-safe in-memory sliding-window log rate limiter.

    Maintains a sliding window of request timestamps per client IP.
    Automatically evicts expired timestamps and bounds maximum tracked client entries
    to prevent memory exhaustion.
    """

    def __init__(
        self,
        max_requests: int = 10,
        window_seconds: int = 60,
        enabled: bool = True,
        max_tracked_clients: int = 10_000,
        trust_proxy_headers: bool = False,
        trusted_proxies: Optional[List[str]] = None,
        time_provider: Optional[Callable[[], float]] = None
    ):
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._enabled = enabled
        self._max_tracked_clients = max_tracked_clients
        self._trust_proxy_headers = trust_proxy_headers
        self._trusted_proxies = trusted_proxies or []
        self._time_provider = time_provider or time.monotonic
        self._client_requests: OrderedDict[str, List[float]] = OrderedDict()
        self._lock: asyncio.Lock = asyncio.Lock()
        self._total_checked: int = 0
        self._total_throttled: int = 0

    @property
    def max_requests(self) -> int:
        return self._max_requests

    @property
    def window_seconds(self) -> int:
        return self._window_seconds

    @property
    def enabled(self) -> bool:
        return self._enabled

    def set_time_provider(self, provider: Optional[Callable[[], float]]) -> None:
        """Inject custom monotonic time provider for deterministic testing."""
        self._time_provider = provider or time.monotonic

    def configure(
        self,
        max_requests: Optional[int] = None,
        window_seconds: Optional[int] = None,
        enabled: Optional[bool] = None,
        trust_proxy_headers: Optional[bool] = None,
        trusted_proxies: Optional[List[str]] = None
    ) -> None:
        """Update runtime configuration parameters."""
        if max_requests is not None:
            if max_requests < 1:
                raise ValueError("max_requests must be at least 1")
            self._max_requests = max_requests
        if window_seconds is not None:
            if window_seconds < 1:
                raise ValueError("window_seconds must be at least 1")
            self._window_seconds = window_seconds
        if enabled is not None:
            self._enabled = enabled
        if trust_proxy_headers is not None:
            self._trust_proxy_headers = trust_proxy_headers
        if trusted_proxies is not None:
            self._trusted_proxies = trusted_proxies

    async def clear(self) -> None:
        """Clear all tracked request history and reset stats."""
        async with self._lock:
            self._client_requests.clear()
            self._total_checked = 0
            self._total_throttled = 0

    async def get_tracked_client_count(self) -> int:
        """Return the number of currently tracked client IPs."""
        async with self._lock:
            return len(self._client_requests)

    async def get_client_request_count(self, client_ip: str) -> int:
        """Return number of valid requests in the current window for client_ip."""
        now = self._time_provider()
        window_start = now - self._window_seconds
        async with self._lock:
            timestamps = self._client_requests.get(client_ip, [])
            return len([t for t in timestamps if t > window_start])

    async def get_stats(self) -> Dict[str, Any]:
        """Return observability metrics."""
        async with self._lock:
            return {
                "max_requests": self._max_requests,
                "window_seconds": self._window_seconds,
                "enabled": self._enabled,
                "tracked_clients": len(self._client_requests),
                "total_checked": self._total_checked,
                "total_throttled": self._total_throttled
            }

    def _prune_stale_clients_unlocked(self, now: float) -> None:
        """Evict clients with no active timestamps in current window to bound memory."""
        window_start = now - self._window_seconds
        stale_keys = [
            ip for ip, ts in self._client_requests.items()
            if not ts or ts[-1] <= window_start
        ]
        for ip in stale_keys:
            del self._client_requests[ip]

        # If still over limit after purging stale entries, evict oldest entries (FIFO)
        while len(self._client_requests) > self._max_tracked_clients:
            self._client_requests.popitem(last=False)

    async def check_rate_limit(self, request: Request) -> None:
        """Evaluate rate limit for an incoming request.

        Raises:
            RateLimitExceededError: When client IP has exceeded max_requests in window_seconds.
        """
        if not self._enabled:
            return

        client_ip = extract_client_ip(
            request,
            trust_proxy_headers=self._trust_proxy_headers,
            trusted_proxies=self._trusted_proxies
        )
        now = self._time_provider()
        window_start = now - self._window_seconds

        async with self._lock:
            self._total_checked += 1
            timestamps = self._client_requests.get(client_ip, [])
            valid_timestamps = [t for t in timestamps if t > window_start]

            if len(valid_timestamps) >= self._max_requests:
                self._total_throttled += 1
                oldest_in_window = valid_timestamps[0]
                retry_after_float = (oldest_in_window + self._window_seconds) - now
                retry_after = max(1, int(math.ceil(retry_after_float)))

                # Update client entry and move to end (MRU)
                self._client_requests[client_ip] = valid_timestamps
                self._client_requests.move_to_end(client_ip)

                logger.warning(
                    "Rate limit exceeded for IP %s on %s (current: %d, max: %d, retry_after: %ds)",
                    client_ip,
                    request.url.path,
                    len(valid_timestamps),
                    self._max_requests,
                    retry_after
                )

                raise RateLimitExceededError(
                    message=f"Rate limit exceeded. Maximum {self._max_requests} requests per {self._window_seconds}s allowed.",
                    retry_after=retry_after,
                    details={
                        "retry_after": retry_after,
                        "limit": self._max_requests,
                        "window_seconds": self._window_seconds
                    }
                )

            # Record this valid request
            valid_timestamps.append(now)
            self._client_requests[client_ip] = valid_timestamps
            self._client_requests.move_to_end(client_ip)

            # Prevent unbounded memory growth
            if len(self._client_requests) > self._max_tracked_clients:
                self._prune_stale_clients_unlocked(now)


# Global singleton instance configured from application settings
ai_rate_limiter = SlidingWindowRateLimiter(
    max_requests=settings.AI_RATE_LIMIT_REQUESTS,
    window_seconds=settings.AI_RATE_LIMIT_WINDOW_SECONDS,
    enabled=settings.AI_RATE_LIMIT_ENABLED
)


async def check_ai_rate_limit(request: Request) -> None:
    """FastAPI route dependency to enforce rate limiting on AI insights."""
    await ai_rate_limiter.check_rate_limit(request)
