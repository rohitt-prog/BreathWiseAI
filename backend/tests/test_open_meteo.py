"""Tests for Open-Meteo Air Quality and Weather Provider."""
import pytest
import respx
import httpx
from app.providers.open_meteo import OpenMeteoAirQualityProvider, OpenMeteoWeatherProvider
from app.core.config import settings
from app.core.exceptions import ProviderUnavailableError
from app.schemas.common import DataClassification, QualityStatus


@pytest.mark.asyncio
@respx.mock
async def test_open_meteo_current_air_quality_success(mock_open_meteo_aqi_payload):
    """Test successful Open-Meteo air quality response parsing with strict integrity rules."""
    respx.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_aqi_payload)
    )

    provider = OpenMeteoAirQualityProvider()
    result = await provider.get_current_air_quality(28.6508, 77.3152)

    # 1. Source classification must be MODELLED_FORECAST
    assert result.source_type == DataClassification.MODELLED_FORECAST
    assert result.quality_status == QualityStatus.MODELLED_APPROXIMATION

    # 2. Strict timestamp semantics: observed_at must be None, forecast_timestamp populated
    assert result.observed_at is None
    assert result.forecast_timestamp is not None
    assert result.model_run_timestamp is None
    assert result.model_data_available_at is None

    # 3. STRICT RULE: indian_naqi must be None (never fabricate or convert from US/EU AQI)
    assert result.indian_naqi is None
    assert result.indian_naqi_category is None
    assert "CPCB" in result.indian_naqi_unavailable_reason

    # 4. Available pollutants normalized
    assert "PM2.5" in result.available_pollutants
    assert result.available_pollutants["PM2.5"].concentration == 142.5
    assert result.available_pollutants["PM2.5"].unit == "µg/m³"
    assert result.available_pollutants["PM2.5"].sub_index is None

    # 5. CO conversion from µg/m³ to mg/m³
    assert "CO" in result.available_pollutants
    assert result.available_pollutants["CO"].concentration == 1.85
    assert result.available_pollutants["CO"].unit == "mg/m³"

    # 6. Unavailable pollutants identified (NH3 and Pb are not produced by CAMS)
    assert "NH3" in result.unavailable_pollutants
    assert "Pb" in result.unavailable_pollutants

    # 7. Modelled data must NOT establish an official dominant pollutant (Preferred Approach)
    assert result.dominant_pollutant is None
    assert result.dominant_pollutant_methodology is None
    assert "Instantaneous modelled concentrations cannot establish" in result.dominant_pollutant_reason


@pytest.mark.asyncio
@respx.mock
async def test_open_meteo_missing_pollutant_handling():
    """Test handling when some pollutants are null in Open-Meteo payload."""
    payload = {
        "current": {
            "time": "2026-11-29T10:00",
            "pm2_5": 85.0,
            "pm10": None,  # PM10 missing
            "carbon_monoxide": None
        },
        "current_units": {"pm2_5": "µg/m³"}
    }
    respx.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
        return_value=httpx.Response(200, json=payload)
    )

    provider = OpenMeteoAirQualityProvider()
    result = await provider.get_current_air_quality(28.6508, 77.3152)

    assert "PM2.5" in result.available_pollutants
    assert "PM10" not in result.available_pollutants
    assert "PM10" in result.unavailable_pollutants


@pytest.mark.asyncio
@respx.mock
async def test_open_meteo_provider_timeout():
    """Test handling of HTTP client timeout."""
    respx.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
        side_effect=httpx.TimeoutException("Connection timed out")
    )

    provider = OpenMeteoAirQualityProvider()
    with pytest.raises(ProviderUnavailableError) as exc_info:
        await provider.get_current_air_quality(28.6508, 77.3152)

    assert "temporarily unavailable" in str(exc_info.value)


@pytest.mark.asyncio
@respx.mock
async def test_open_meteo_provider_http_500_error():
    """Test handling of upstream server 500 error."""
    respx.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
        return_value=httpx.Response(500, text="Internal Server Error")
    )

    provider = OpenMeteoAirQualityProvider()
    with pytest.raises(ProviderUnavailableError):
        await provider.get_current_air_quality(28.6508, 77.3152)


@pytest.mark.asyncio
@respx.mock
async def test_open_meteo_forecast(mock_open_meteo_aqi_payload):
    """Test hourly forecast parsing from Open-Meteo."""
    respx.get(settings.OPEN_METEO_AIR_QUALITY_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_aqi_payload)
    )

    provider = OpenMeteoAirQualityProvider()
    forecast = await provider.get_forecast(28.6508, 77.3152)

    assert len(forecast.hourly_forecast) == 3
    assert forecast.hourly_forecast[0].pm2_5 == 142.5
    assert forecast.hourly_forecast[0].modelled_aqi_estimate == 195  # US AQI from CAMS
    assert forecast.source_type == DataClassification.MODELLED_FORECAST
    assert forecast.model_run_timestamp is None


@pytest.mark.asyncio
@respx.mock
async def test_open_meteo_weather(mock_open_meteo_weather_payload):
    """Test weather and boundary layer dispersion parsing."""
    respx.get(settings.OPEN_METEO_WEATHER_URL).mock(
        return_value=httpx.Response(200, json=mock_open_meteo_weather_payload)
    )

    provider = OpenMeteoWeatherProvider()
    weather = await provider.get_current_weather(28.6508, 77.3152)

    assert weather.temperature_c == 18.5
    assert weather.relative_humidity == 68
    assert weather.wind_speed_kmh == 4.2
    assert weather.wind_direction_cardinal == "WNW"
    assert weather.boundary_layer_height_meters == 210.0

    # Dispersion conditions & stagnation risk (heuristic, not confirmed inversion claim)
    assert weather.stagnation_risk == "Elevated"
    assert weather.dispersion_conditions == "Potentially Unfavorable"
    assert "does not establish a confirmed" in weather.stagnation_description.lower()
    assert "temperature inversion" in weather.stagnation_description.lower()
    assert "heuristic" in weather.stagnation_description.lower()
    assert "trapping all" not in weather.stagnation_description.lower()

    # Strict timestamp semantics: observed_at must be None, forecast_timestamp populated
    assert weather.observed_at is None
    assert weather.forecast_timestamp is not None
    assert weather.model_run_timestamp is None
    assert weather.model_data_available_at is None
