"""Tests for health check endpoint."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(async_client: AsyncClient):
    """Test /health and /api/v1/health endpoints."""
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "uptime_seconds" in data
    assert "version" in data
    assert "providers" in data
    assert data["providers"]["open_meteo"] == "operational"

    # Also verify /api/v1/health alias
    v1_resp = await async_client.get("/api/v1/health")
    assert v1_resp.status_code == 200
    assert v1_resp.json()["status"] == "healthy"
