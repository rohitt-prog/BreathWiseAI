"""Open-Meteo Air Quality and Weather Provider."""
from datetime import datetime, timezone
from typing import Optional, Dict
import httpx

from ..core.config import settings
from ..core.exceptions import ProviderUnavailableError
from ..core.logging import logger
from ..schemas.common import (
    DataClassification,
    FreshnessStatus,
    QualityStatus,
    LocationMetadata
)
from ..schemas.air_quality import (
    NormalizedAirQualityResponse,
    NormalizedPollutant,
    HourlyForecastPoint,
    AirQualityForecastResponse
)
from ..schemas.weather import NormalizedWeatherResponse
from ..services.data_validation import (
    classify_freshness,
    classify_forecast_validity,
    validate_pollutant_concentration,
    derive_wind_cardinal,
    derive_dispersion_conditions,
    determine_dominant_pollutant
)
from .base import BaseAirQualityProvider, BaseWeatherProvider


class OpenMeteoAirQualityProvider(BaseAirQualityProvider):
    """Integrates Open-Meteo Atmospheric Chemistry (CAMS) Air Quality API."""

    @property
    def provider_id(self) -> str:
        return "open_meteo"

    @property
    def name(self) -> str:
        return "Open-Meteo CAMS Air Quality Forecast"

    @property
    def classification(self) -> DataClassification:
        return DataClassification.MODELLED_FORECAST

    def is_configured(self) -> bool:
        # Open-Meteo is a public open-access API requiring no API key
        return True

    async def get_current_air_quality(
        self,
        latitude: float,
        longitude: float,
        client: Optional[httpx.AsyncClient] = None
    ) -> NormalizedAirQualityResponse:
        """Fetch current atmospheric composition forecast from Open-Meteo."""
        retrieved_at = datetime.now(timezone.utc)
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "current": "pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi",
            "timezone": "UTC"
        }

        should_close = False
        if client is None:
            client = httpx.AsyncClient(timeout=settings.OPEN_METEO_TIMEOUT_SECONDS)
            should_close = True

        try:
            logger.info("Fetching Open-Meteo current air quality for lat=%s, lon=%s", latitude, longitude)
            response = await client.get(settings.OPEN_METEO_AIR_QUALITY_URL, params=params)
            response.raise_for_status()
            data = response.json()
        except httpx.TimeoutException as exc:
            logger.error("Open-Meteo air quality request timed out after %s seconds", settings.OPEN_METEO_TIMEOUT_SECONDS)
            raise ProviderUnavailableError(
                provider=self.name,
                message=f"Request timed out after {settings.OPEN_METEO_TIMEOUT_SECONDS}s"
            ) from exc
        except httpx.HTTPStatusError as exc:
            logger.error("Open-Meteo returned HTTP error: %s", exc.response.status_code)
            raise ProviderUnavailableError(
                provider=self.name,
                message=f"HTTP {exc.response.status_code}: {exc.response.text}"
            ) from exc
        except Exception as exc:
            logger.error("Unexpected error querying Open-Meteo: %s", str(exc))
            raise ProviderUnavailableError(
                provider=self.name,
                message=f"Network or parsing failure: {str(exc)}"
            ) from exc
        finally:
            if should_close:
                await client.aclose()

        current = data.get("current", {})
        current_units = data.get("current_units", {})
        raw_time = current.get("time")

        # Parse forecast prediction validity timestamp
        forecast_valid_time = None
        if raw_time:
            try:
                forecast_valid_time = datetime.fromisoformat(raw_time).replace(tzinfo=timezone.utc)
            except ValueError:
                forecast_valid_time = retrieved_at

        # Separate retrieval freshness from forecast validity
        retrieval_freshness = classify_freshness(retrieved_at, max_fresh_minutes=settings.OPEN_METEO_FRESHNESS_MINUTES)
        forecast_validity = classify_forecast_validity(forecast_valid_time)

        # Mapping Open-Meteo variables to Indian NAQI pollutant codes
        mapping = [
            ("pm2_5", "PM2.5", "Fine Particulate Matter (< 2.5 µm)", "µg/m³"),
            ("pm10", "PM10", "Coarse Particulates (< 10 µm)", "µg/m³"),
            ("nitrogen_dioxide", "NO2", "Nitrogen Dioxide", "µg/m³"),
            ("sulphur_dioxide", "SO2", "Sulfur Dioxide", "µg/m³"),
            ("carbon_monoxide", "CO", "Carbon Monoxide", "mg/m³"),  # Open-Meteo gives µg/m³, we normalize CO
            ("ozone", "O3", "Ground-Level Ozone", "µg/m³")
        ]

        pollutants_dict: Dict[str, NormalizedPollutant] = {}
        unavailable_pollutants = []

        for om_key, code, name, default_unit in mapping:
            raw_val = current.get(om_key)
            if raw_val is not None:
                unit = current_units.get(om_key, default_unit)
                # Normalize unicode micro symbols to standard micro sign
                unit = unit.replace("\u03bc", "µ").replace("ug", "µg")
                # Convert CO from µg/m³ to mg/m³ if needed for consistency with Indian standards
                if code == "CO" and ("µg" in unit or "ug" in unit):
                    raw_val = raw_val / 1000.0
                    unit = "mg/m³"

                val_clean, is_valid = validate_pollutant_concentration(code, raw_val, unit)
                if is_valid and val_clean is not None:
                    pollutants_dict[code] = NormalizedPollutant(
                        code=code,
                        name=name,
                        concentration=val_clean,
                        unit=unit,
                        source=self.name,
                        measurement_timestamp=forecast_valid_time or retrieved_at,
                        data_classification=self.classification,
                        validation_status=retrieval_freshness,
                        sub_index=None,  # Strictly None: Open-Meteo is CAMS modelled, not CPCB physical observation
                        category=None
                    )
                else:
                    unavailable_pollutants.append(code)
            else:
                unavailable_pollutants.append(code)

        # NH3 and Pb are not produced by CAMS global composition models
        unavailable_pollutants.extend(["NH3", "Pb"])

        # Determine dominant pollutant using rigorous dimensionless benchmark ratios (never raw concentration comparisons)
        dom_pollutant, dom_methodology, dom_reason = determine_dominant_pollutant(
            pollutants_dict,
            is_official_cpcb=False
        )

        return NormalizedAirQualityResponse(
            location=LocationMetadata(
                latitude=latitude,
                longitude=longitude,
                name=f"Model Grid ({latitude:.3f}, {longitude:.3f})",
                country="India" if (8.0 <= latitude <= 37.0 and 68.0 <= longitude <= 97.5) else None
            ),
            provider=self.name,
            source_type=self.classification,
            retrieved_at=retrieved_at,
            model_run_timestamp=None,  # Not exposed in standard Open-Meteo endpoint; identified as unavailable
            model_data_available_at=None,
            observed_at=None,  # STRICT INTEGRITY: Modelled forecast has zero physical sensor observations
            forecast_timestamp=forecast_valid_time,
            retrieval_freshness=retrieval_freshness,
            freshness_status=retrieval_freshness,
            model_run_freshness=FreshnessStatus.UNAVAILABLE,
            observation_age_minutes=None,
            observation_freshness=None,
            forecast_validity=forecast_validity,
            quality_status=QualityStatus.MODELLED_APPROXIMATION,
            indian_naqi=None,  # STRICT INTEGRITY: Modelled forecast data is NOT an official Indian NAQI reading
            indian_naqi_category=None,
            indian_naqi_unavailable_reason=(
                "Official Indian NAQI requires verified physical station measurements from CPCB conforming to 16–24 hour "
                "multi-pollutant averaging requirements. Open-Meteo provides atmospheric chemistry forecasts (CAMS), not official NAQI observations."
            ),
            dominant_pollutant=dom_pollutant,
            dominant_pollutant_methodology=dom_methodology,
            dominant_pollutant_reason=dom_reason,
            available_pollutants=pollutants_dict,
            unavailable_pollutants=unavailable_pollutants,
            source_attribution=(
                "Open-Meteo Air Quality API (Copernicus Atmosphere Monitoring Service - CAMS Global Forecast)"
            ),
            limitations=[
                "Modelled atmospheric composition based on ECMWF/CAMS global forecast with ~40 km grid resolution.",
                "Values reflect regional atmospheric chemistry models, not localized physical ground-level sensor observations.",
                "Cannot be used as official CPCB regulatory compliance data or clinical medical exposure metrics.",
                "US AQI / European AQI values reported by CAMS are not converted to Indian NAQI."
            ]
        )

    async def get_forecast(
        self,
        latitude: float,
        longitude: float,
        client: Optional[httpx.AsyncClient] = None
    ) -> AirQualityForecastResponse:
        """Fetch 48-hour hourly forecast from Open-Meteo."""
        retrieved_at = datetime.now(timezone.utc)
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "hourly": "pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi",
            "timezone": "UTC",
            "forecast_days": 2
        }

        should_close = False
        if client is None:
            client = httpx.AsyncClient(timeout=settings.OPEN_METEO_TIMEOUT_SECONDS)
            should_close = True

        try:
            logger.info("Fetching Open-Meteo air quality forecast for lat=%s, lon=%s", latitude, longitude)
            response = await client.get(settings.OPEN_METEO_AIR_QUALITY_URL, params=params)
            response.raise_for_status()
            data = response.json()
        except Exception as exc:
            logger.error("Failed to fetch Open-Meteo forecast: %s", str(exc))
            raise ProviderUnavailableError(
                provider=self.name,
                message=f"Forecast retrieval error: {str(exc)}"
            ) from exc
        finally:
            if should_close:
                await client.aclose()

        hourly_data = data.get("hourly", {})
        times = hourly_data.get("time", [])
        pm25_vals = hourly_data.get("pm2_5", [])
        pm10_vals = hourly_data.get("pm10", [])
        no2_vals = hourly_data.get("nitrogen_dioxide", [])
        so2_vals = hourly_data.get("sulphur_dioxide", [])
        o3_vals = hourly_data.get("ozone", [])
        us_aqi_vals = hourly_data.get("us_aqi", [])

        points = []
        for i, t_str in enumerate(times):
            try:
                t_dt = datetime.fromisoformat(t_str).replace(tzinfo=timezone.utc)
            except ValueError:
                continue

            pm25 = float(pm25_vals[i]) if i < len(pm25_vals) and pm25_vals[i] is not None else None
            pm10 = float(pm10_vals[i]) if i < len(pm10_vals) and pm10_vals[i] is not None else None
            no2 = float(no2_vals[i]) if i < len(no2_vals) and no2_vals[i] is not None else None
            so2 = float(so2_vals[i]) if i < len(so2_vals) and so2_vals[i] is not None else None
            o3 = float(o3_vals[i]) if i < len(o3_vals) and o3_vals[i] is not None else None
            modelled_index = int(us_aqi_vals[i]) if i < len(us_aqi_vals) and us_aqi_vals[i] is not None else None

            points.append(HourlyForecastPoint(
                timestamp=t_dt,
                modelled_aqi_estimate=modelled_index,  # Transparently labeled as model estimate
                pm2_5=pm25,
                pm10=pm10,
                nitrogen_dioxide=no2,
                sulphur_dioxide=so2,
                ozone=o3,
                data_classification=self.classification
            ))

        retrieval_freshness = classify_freshness(retrieved_at)

        return AirQualityForecastResponse(
            location=LocationMetadata(latitude=latitude, longitude=longitude),
            provider=self.name,
            source_type=self.classification,
            retrieved_at=retrieved_at,
            model_run_timestamp=None,
            model_data_available_at=None,
            retrieval_freshness=retrieval_freshness,
            hourly_forecast=points,
            source_attribution=(
                "Open-Meteo Air Quality Forecast API (Copernicus CAMS Modelled Data)"
            ),
            limitations=[
                "Hourly points represent regional atmospheric chemistry model predictions (~40 km grid).",
                "Modelled AQI estimate corresponds to US EPA scale reported by CAMS; this is NOT Indian NAQI."
            ]
        )


class OpenMeteoWeatherProvider(BaseWeatherProvider):
    """Integrates Open-Meteo Numerical Weather Prediction API."""

    @property
    def provider_id(self) -> str:
        return "open_meteo_weather"

    @property
    def name(self) -> str:
        return "Open-Meteo Weather & Boundary Layer Forecast"

    @property
    def classification(self) -> DataClassification:
        return DataClassification.MODELLED_FORECAST

    def is_configured(self) -> bool:
        return True

    async def get_current_weather(
        self,
        latitude: float,
        longitude: float,
        client: Optional[httpx.AsyncClient] = None
    ) -> NormalizedWeatherResponse:
        """Fetch current surface weather and atmospheric boundary layer height."""
        retrieved_at = datetime.now(timezone.utc)
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m",
            "hourly": "boundary_layer_height",
            "timezone": "UTC",
            "forecast_days": 1
        }

        should_close = False
        if client is None:
            client = httpx.AsyncClient(timeout=settings.OPEN_METEO_TIMEOUT_SECONDS)
            should_close = True

        try:
            logger.info("Fetching Open-Meteo weather for lat=%s, lon=%s", latitude, longitude)
            response = await client.get(settings.OPEN_METEO_WEATHER_URL, params=params)
            response.raise_for_status()
            data = response.json()
        except Exception as exc:
            logger.error("Failed to fetch Open-Meteo weather: %s", str(exc))
            raise ProviderUnavailableError(
                provider=self.name,
                message=f"Weather retrieval error: {str(exc)}"
            ) from exc
        finally:
            if should_close:
                await client.aclose()

        current = data.get("current", {})
        raw_time = current.get("time")

        forecast_valid_time = None
        if raw_time:
            try:
                forecast_valid_time = datetime.fromisoformat(raw_time).replace(tzinfo=timezone.utc)
            except ValueError:
                forecast_valid_time = retrieved_at

        retrieval_freshness = classify_freshness(retrieved_at, max_fresh_minutes=180)
        forecast_validity = classify_forecast_validity(forecast_valid_time)

        temp_c = current.get("temperature_2m")
        humidity = current.get("relative_humidity_2m")
        wind_speed = current.get("wind_speed_10m")
        wind_deg = current.get("wind_direction_10m")
        wind_cardinal = derive_wind_cardinal(wind_deg)

        # Boundary layer height from hourly current index
        hourly_bl = data.get("hourly", {}).get("boundary_layer_height", [])
        boundary_layer_m = float(hourly_bl[0]) if hourly_bl else None

        # Derive dispersion conditions and stagnation risk (heuristic, not confirmed inversion)
        stagnation_risk, dispersion_conds, stagnation_desc = derive_dispersion_conditions(
            boundary_layer_m,
            wind_speed
        )

        return NormalizedWeatherResponse(
            location=LocationMetadata(
                latitude=latitude,
                longitude=longitude,
                name=f"Weather Node ({latitude:.3f}, {longitude:.3f})"
            ),
            provider=self.name,
            source_type=DataClassification.MODELLED_FORECAST,
            retrieved_at=retrieved_at,
            model_run_timestamp=None,  # Unexposed by standard Open-Meteo endpoint
            model_data_available_at=None,
            observed_at=None,  # STRICT INTEGRITY: Modelled forecast has zero physical observations
            forecast_timestamp=forecast_valid_time,
            retrieval_freshness=retrieval_freshness,
            freshness_status=retrieval_freshness,
            model_run_freshness=FreshnessStatus.UNAVAILABLE,
            observation_age_minutes=None,
            observation_freshness=None,
            forecast_validity=forecast_validity,
            temperature_c=temp_c,
            relative_humidity=humidity,
            wind_speed_kmh=wind_speed,
            wind_direction_degrees=wind_deg,
            wind_direction_cardinal=wind_cardinal,
            boundary_layer_height_meters=boundary_layer_m,
            stagnation_risk=stagnation_risk,
            dispersion_conditions=dispersion_conds,
            stagnation_description=stagnation_desc,
            source_attribution="Open-Meteo Numerical Weather Prediction Models (ECMWF / DWD / GFS)",
            limitations=[
                "Boundary layer height derived from European numerical meteorological models (~11 km resolution).",
                "Dispersion conditions provide a regional meteorological heuristic and do not establish a confirmed vertical temperature inversion.",
                "Actual micro-scale boundary layer dynamics near buildings and roadways may vary."
            ]
        )
