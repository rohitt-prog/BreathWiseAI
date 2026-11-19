"""OpenAQ v3 Ground Station Provider."""
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
    AirQualityForecastResponse
)
from ..services.data_validation import (
    classify_freshness,
    calculate_observation_age_minutes,
    classify_observation_freshness,
    classify_model_run_freshness,
    parse_observation_timestamp,
    validate_pollutant_concentration,
    determine_dominant_pollutant
)
from ..core.cache import (
    InMemoryCache,
    telemetry_cache,
    make_cache_key,
    TTL_OPENAQ_LOCATIONS,
)
from .base import BaseAirQualityProvider


class OpenAQProvider(BaseAirQualityProvider):
    """Integrates OpenAQ v3 Physical Ground Sensors and Monitors."""

    def __init__(self, cache: Optional[InMemoryCache] = None):
        self.cache = cache or telemetry_cache

    @property
    def provider_id(self) -> str:
        return "openaq"

    @property
    def name(self) -> str:
        return "OpenAQ v3 Ground Monitors"

    @property
    def classification(self) -> DataClassification:
        return DataClassification.OBSERVATION

    def is_configured(self) -> bool:
        """OpenAQ v3 mandates an X-API-Key header."""
        return bool(settings.OPENAQ_API_KEY and settings.OPENAQ_API_KEY.strip())

    async def get_current_air_quality(
        self,
        latitude: float,
        longitude: float,
        client: Optional[httpx.AsyncClient] = None
    ) -> NormalizedAirQualityResponse:
        """Fetch nearest physical sensor measurements from OpenAQ v3."""
        if not self.is_configured():
            logger.info("OpenAQ API key is not configured; returning NOT_CONFIGURED status.")
            return NormalizedAirQualityResponse(
                location=LocationMetadata(latitude=latitude, longitude=longitude),
                provider=self.name,
                source_type=self.classification,
                retrieved_at=datetime.now(timezone.utc),
                freshness_status=FreshnessStatus.NOT_CONFIGURED,
                quality_status=QualityStatus.UNAVAILABLE,
                indian_naqi=None,
                indian_naqi_category=None,
                indian_naqi_unavailable_reason="OpenAQ v3 requires an API key (OPENAQ_API_KEY not configured).",
                available_pollutants={},
                unavailable_pollutants=["PM2.5", "PM10", "NO2", "SO2", "CO", "O3", "NH3", "Pb"],
                source_attribution="OpenAQ v3 (Not Configured)",
                limitations=["OPENAQ_API_KEY is not set in environment. Physical ground sensors are unavailable."]
            )

        retrieved_at = datetime.now(timezone.utc)
        headers = {
            "X-API-Key": settings.OPENAQ_API_KEY,
            "User-Agent": "BreatheWiseAI/1.0"
        }
        params = {
            "coordinates": f"{latitude},{longitude}",
            "radius": 25000,  # 25 km radius
            "order_by": "distance",
            "limit": 1
        }

        should_close = False
        if client is None:
            client = httpx.AsyncClient(timeout=settings.OPENAQ_TIMEOUT_SECONDS)
            should_close = True

        try:
            loc_cache_key = make_cache_key("openaq", "locations", latitude, longitude, radius=25000)

            async def _fetch_locations() -> dict:
                logger.info("Querying OpenAQ v3 locations near lat=%s, lon=%s", latitude, longitude)
                loc_resp = await client.get(
                    f"{settings.OPENAQ_BASE_URL}/locations",
                    params=params,
                    headers=headers
                )
                loc_resp.raise_for_status()
                return loc_resp.json()

            loc_data = await self.cache.get_or_set(
                key=loc_cache_key,
                ttl_seconds=TTL_OPENAQ_LOCATIONS,
                fetcher=_fetch_locations
            )

            results = loc_data.get("results", [])
            if not results:
                logger.info("No OpenAQ v3 ground locations found within 25km of (%s, %s)", latitude, longitude)
                return NormalizedAirQualityResponse(
                    location=LocationMetadata(latitude=latitude, longitude=longitude),
                    provider=self.name,
                    source_type=self.classification,
                    retrieved_at=retrieved_at,
                    observed_at=None,
                    forecast_timestamp=None,
                    model_run_timestamp=None,
                    model_data_available_at=None,
                    retrieval_freshness=FreshnessStatus.UNAVAILABLE,
                    freshness_status=FreshnessStatus.UNAVAILABLE,
                    quality_status=QualityStatus.UNAVAILABLE,
                    indian_naqi=None,
                    indian_naqi_category=None,
                    indian_naqi_unavailable_reason="No OpenAQ monitoring stations found within 25 km of coordinates.",
                    dominant_pollutant=None,
                    dominant_pollutant_methodology=None,
                    dominant_pollutant_reason="No monitoring stations found.",
                    available_pollutants={},
                    unavailable_pollutants=["PM2.5", "PM10", "NO2", "SO2", "CO", "O3", "NH3", "Pb"],
                    source_attribution="OpenAQ Community & Government Air Sensors",
                    limitations=["No physical ground sensors available in immediate vicinity."]
                )

            location_obj = results[0]
            location_id = location_obj.get("id")
            station_name = location_obj.get("name", f"Station #{location_id}")
            station_coords = location_obj.get("coordinates", {})
            st_lat = station_coords.get("latitude", latitude)
            st_lon = station_coords.get("longitude", longitude)

            # Query latest sensor measurements for this location
            latest_resp = await client.get(
                f"{settings.OPENAQ_BASE_URL}/locations/{location_id}/latest",
                headers=headers
            )
            latest_resp.raise_for_status()
            latest_data = latest_resp.json()
            sensor_results = latest_data.get("results", [])

        except httpx.TimeoutException as exc:
            logger.error("OpenAQ v3 timed out for coordinates (%s, %s)", latitude, longitude)
            raise ProviderUnavailableError(
                provider=self.name,
                message=f"Request timed out after {settings.OPENAQ_TIMEOUT_SECONDS}s"
            ) from exc
        except httpx.HTTPStatusError as exc:
            logger.error("OpenAQ v3 returned HTTP error: %s", exc.response.status_code)
            raise ProviderUnavailableError(
                provider=self.name,
                message=f"HTTP {exc.response.status_code}: {exc.response.text}"
            ) from exc
        except Exception as exc:
            logger.error("OpenAQ v3 request failed: %s", str(exc))
            raise ProviderUnavailableError(
                provider=self.name,
                message=f"Network or parsing error: {str(exc)}"
            ) from exc
        finally:
            if should_close:
                await client.aclose()

        # Parse sensor measurements
        pollutants_dict: Dict[str, NormalizedPollutant] = {}
        observed_timestamps = []

        # Standard parameter code normalization
        PARAM_MAP = {
            "pm25": ("PM2.5", "Fine Particulate Matter (< 2.5 µm)", "µg/m³"),
            "pm10": ("PM10", "Coarse Particulates (< 10 µm)", "µg/m³"),
            "no2": ("NO2", "Nitrogen Dioxide", "µg/m³"),
            "so2": ("SO2", "Sulfur Dioxide", "µg/m³"),
            "co": ("CO", "Carbon Monoxide", "mg/m³"),
            "o3": ("O3", "Ground-Level Ozone", "µg/m³"),
            "nh3": ("NH3", "Ammonia", "µg/m³"),
            "pb": ("Pb", "Lead", "µg/m³")
        }

        for item in sensor_results:
            param_key = str(item.get("parameter", {}).get("name", "")).lower().replace(".", "").replace("-", "")
            if param_key in PARAM_MAP:
                code, name, default_unit = PARAM_MAP[param_key]
                val = item.get("value")
                unit = item.get("unit", default_unit)

                # Strict timestamp validation: reject missing, malformed, naive, or future-dated timestamps; NEVER fabricate or substitute retrieval time
                dt_raw = item.get("datetime", {}).get("utc") or item.get("datetime", {}).get("local")
                if not dt_raw:
                    logger.warning("Rejecting OpenAQ measurement for %s: missing observation timestamp", code)
                    continue

                m_time, is_valid_ts, ts_err = parse_observation_timestamp(
                    dt_raw,
                    require_explicit_timezone=True
                )
                if not is_valid_ts or m_time is None:
                    logger.warning("Rejecting OpenAQ measurement for %s: invalid or naive timestamp %s (%s)", code, dt_raw, ts_err)
                    continue

                # Reject future-dated observations beyond clock-skew tolerance (120s)
                obs_age = calculate_observation_age_minutes(m_time, retrieved_at)
                if obs_age is None:
                    logger.warning("Rejecting OpenAQ measurement for %s: future-dated timestamp %s beyond clock skew", code, m_time)
                    continue

                clean_val, is_valid = validate_pollutant_concentration(code, val, unit)
                if not is_valid or clean_val is None:
                    logger.warning("Rejecting OpenAQ measurement for %s: invalid concentration %s", code, val)
                    continue

                # Chronological comparison: if multiple records exist for this pollutant, retain chronologically latest
                if code in pollutants_dict:
                    existing_dt = pollutants_dict[code].measurement_timestamp
                    if m_time <= existing_dt:
                        continue  # Keep the newer measurement

                observed_timestamps.append(m_time)
                pollutants_dict[code] = NormalizedPollutant(
                    code=code,
                    name=name,
                    concentration=clean_val,
                    unit=unit,
                    source=f"OpenAQ Ground Station: {station_name}",
                    measurement_timestamp=m_time,
                    data_classification=self.classification,
                    validation_status=classify_observation_freshness(m_time, retrieved_at, max_fresh_minutes=settings.OBSERVATION_FRESHNESS_MINUTES) or FreshnessStatus.UNAVAILABLE,
                    sub_index=None,
                    category=None
                )

        most_recent_obs = max(observed_timestamps) if observed_timestamps else None
        obs_age_min = calculate_observation_age_minutes(most_recent_obs, retrieved_at)
        obs_freshness = classify_observation_freshness(most_recent_obs, retrieved_at, max_fresh_minutes=settings.OBSERVATION_FRESHNESS_MINUTES)
        retrieval_freshness = classify_freshness(retrieved_at, max_fresh_minutes=settings.OBSERVATION_FRESHNESS_MINUTES)

        all_req_codes = ["PM2.5", "PM10", "NO2", "SO2", "CO", "O3", "NH3", "Pb"]
        unavailable = [c for c in all_req_codes if c not in pollutants_dict]

        dom_pollutant, dom_method, dom_reason = determine_dominant_pollutant(
            pollutants_dict,
            is_official_cpcb=False
        )

        limitations = [
            "Sensors may include low-cost optical particle counters alongside reference monitors.",
            "Measurement timestamp reflects latest reported ingest, which may vary by sensor connectivity.",
            "Incomplete pollutant sets must not be merged across different stations."
        ]
        if obs_freshness == FreshnessStatus.STALE and obs_age_min is not None:
            limitations.append(
                f"STALE PHYSICAL OBSERVATION WARNING: Most recent measurement was recorded {obs_age_min:.0f} minutes ago. Do not interpret as current instantaneous air quality."
            )

        quality_status = QualityStatus.UNVERIFIED_SENSOR if pollutants_dict else QualityStatus.UNAVAILABLE

        return NormalizedAirQualityResponse(
            location=LocationMetadata(
                latitude=st_lat,
                longitude=st_lon,
                name=station_name,
                country="India" if (8.0 <= st_lat <= 37.0 and 68.0 <= st_lon <= 97.5) else None
            ),
            provider=self.name,
            source_type=self.classification,
            retrieved_at=retrieved_at,
            model_run_timestamp=None,
            model_data_available_at=None,
            observed_at=most_recent_obs,
            forecast_timestamp=None,
            retrieval_freshness=retrieval_freshness,
            freshness_status=retrieval_freshness,
            model_run_freshness=FreshnessStatus.UNAVAILABLE,
            observation_age_minutes=obs_age_min,
            observation_freshness=obs_freshness,
            forecast_validity=None,
            quality_status=quality_status,
            indian_naqi=None,  # OpenAQ ground sensors may lack 16-24h multi-pollutant CPCB averaging
            indian_naqi_category=None,
            indian_naqi_unavailable_reason="OpenAQ physical sensors provide raw observation feeds; official NAQI requires certified CPCB 16-24 hour sub-index averaging.",
            dominant_pollutant=dom_pollutant,
            dominant_pollutant_methodology=dom_method,
            dominant_pollutant_reason=dom_reason,
            available_pollutants=pollutants_dict,
            unavailable_pollutants=unavailable,
            source_attribution=f"OpenAQ v3 Platform (Station: {station_name})",
            limitations=limitations
        )

    async def get_forecast(
        self,
        latitude: float,
        longitude: float,
        client: Optional[httpx.AsyncClient] = None
    ) -> AirQualityForecastResponse:
        """OpenAQ does not provide forward forecast models (observations only)."""
        return AirQualityForecastResponse(
            location=LocationMetadata(latitude=latitude, longitude=longitude),
            provider=self.name,
            source_type=self.classification,
            retrieved_at=datetime.now(timezone.utc),
            hourly_forecast=[],
            source_attribution="OpenAQ (Physical observations only; forecasts not supported)",
            limitations=["OpenAQ v3 is strictly a physical sensor archive and does not generate predictive forecast models."]
        )
