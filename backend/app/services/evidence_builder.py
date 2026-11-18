"""Environmental evidence context builder.

Translates normalized environmental telemetry into verifiable evidence items with stable IDs.
Ensures no values are fabricated, source classifications are strictly preserved,
and uncertainty is transparently exposed.
"""
from typing import Dict, List
from datetime import datetime, timezone, timedelta
from ..schemas.common import DataClassification, FreshnessStatus
from ..schemas.air_quality import NormalizedAirQualityResponse
from ..schemas.weather import NormalizedWeatherResponse
from ..schemas.ai import EnvironmentalEvidenceItem, EnvironmentalEvidenceContext
from .deterministic_safety import DeterministicSafetyEngine


def build_evidence_context(
    air_quality: NormalizedAirQualityResponse,
    weather: NormalizedWeatherResponse
) -> EnvironmentalEvidenceContext:
    """Construct minimal structured evidence context from validated telemetry responses.

    Independently evaluates air quality and weather freshness, preserves source
    classification, enforces scientific averaging caveats for PM2.5, and prevents
    fabricated or stale telemetry from being passed off as fresh evidence.
    """
    now_utc = datetime.now(timezone.utc)
    evidence_items: Dict[str, EnvironmentalEvidenceItem] = {}

    # 1. Authoritative Weather Usability Evaluation
    weather_usable, effective_weather_freshness, weather_unusable_reason = (
        DeterministicSafetyEngine.evaluate_weather_usability(weather)
    )

    if weather_usable:
        stagnation_risk = weather.stagnation_risk
        dispersion_conditions = weather.dispersion_conditions
        disp_note = (
            f"Dispersion: {weather.dispersion_conditions}, Stagnation Risk: {weather.stagnation_risk}. "
            f"{weather.stagnation_description}"
        )
    else:
        stagnation_risk = "Unknown"
        dispersion_conditions = "Unknown"
        disp_note = (
            f"Weather telemetry is unavailable ({weather_unusable_reason}). "
            "Atmospheric dispersion conditions cannot be determined."
        )

    # 2. Telemetry Source & Provenance Evidence
    src_class = air_quality.source_type
    src_note = (
        f"Provider: {air_quality.provider}. "
        + ("Physical ground sensor observation." if src_class == DataClassification.OBSERVATION
           else "Regional atmospheric chemistry numerical model prediction (~40km grid). NOT a physical sensor observation.")
    )
    evidence_items["EVID-SOURCE"] = EnvironmentalEvidenceItem(
        evidence_id="EVID-SOURCE",
        parameter="Data Source & Classification",
        value=src_class.value,
        unit=None,
        classification=src_class,
        freshness=air_quality.retrieval_freshness,
        context_note=src_note,
        timestamp=air_quality.retrieved_at,
        averaging_period=None
    )

    # 3. Criteria Pollutant Evidence Items (with Averaging Period Caveats)
    for code, p in air_quality.available_pollutants.items():
        evid_id = f"EVID-{code.replace('.', '').upper()}"
        if code.upper() in ("PM2.5", "PM25"):
            if p.data_classification == DataClassification.MODELLED_FORECAST:
                averaging_note = (
                    "Instantaneous modelled hourly concentration (~40km grid). "
                    "Note: Indian NAAQS (60 µg/m³) is a 24-hour statutory benchmark; "
                    "hourly modelled concentration indicates instantaneous personal exposure level, "
                    "not official 24-hr regulatory compliance."
                )
                averaging_period = "1-hour"
            else:
                averaging_note = (
                    f"Verified ground monitor sub-index: {p.sub_index} ({p.category})."
                    if p.sub_index is not None
                    else "Ground observation concentration."
                )
                averaging_period = "24-hour" if p.sub_index is not None else "1-hour"
        elif code.upper() in ("PM10", "NO2", "SO2", "CO", "O3", "NH3", "PB"):
            if p.data_classification == DataClassification.MODELLED_FORECAST:
                averaging_note = "Modelled regional concentration. Sub-index null for modelled forecast."
                averaging_period = "1-hour"
            else:
                averaging_note = (
                    f"Official sub-index: {p.sub_index} ({p.category})."
                    if p.sub_index is not None
                    else "Observed ground sensor concentration."
                )
                if code.upper() in ("CO", "O3"):
                    averaging_period = "8-hour" if p.sub_index is not None else "1-hour"
                else:
                    averaging_period = "24-hour" if p.sub_index is not None else "1-hour"
        else:
            averaging_note = f"Source: {p.source}."
            averaging_period = "1-hour"

        note = f"{p.name} concentration from {p.source}: {p.concentration:.1f} {p.unit}. {averaging_note}"
        evidence_items[evid_id] = EnvironmentalEvidenceItem(
            evidence_id=evid_id,
            parameter=f"{p.name} ({code})",
            value=f"{p.concentration:.1f}",
            unit=p.unit,
            classification=p.data_classification,
            freshness=p.validation_status,
            context_note=note,
            timestamp=p.measurement_timestamp,
            averaging_period=averaging_period
        )

    # 4. Official Indian NAQI Status
    if air_quality.indian_naqi is not None:
        naqi_val = str(air_quality.indian_naqi)
        naqi_note = f"Official Indian National AQI: {naqi_val} ({air_quality.indian_naqi_category}). Verified physical ground monitoring."
        naqi_class = DataClassification.OBSERVATION
        naqi_ts = air_quality.observed_at or air_quality.retrieved_at
        naqi_avg = "24-hour"
    else:
        naqi_val = "Unavailable"
        naqi_note = (
            air_quality.indian_naqi_unavailable_reason
            or "Official Indian NAQI is unavailable. Regional numerical atmospheric models cannot compute statutory Indian NAQI."
        )
        naqi_class = air_quality.source_type
        naqi_ts = air_quality.retrieved_at
        naqi_avg = None

    evidence_items["EVID-NAQI"] = EnvironmentalEvidenceItem(
        evidence_id="EVID-NAQI",
        parameter="Indian National AQI",
        value=naqi_val,
        unit="Index (0-500)",
        classification=naqi_class,
        freshness=air_quality.retrieval_freshness,
        context_note=naqi_note,
        timestamp=naqi_ts,
        averaging_period=naqi_avg
    )

    weather_ts = weather.observed_at or weather.forecast_timestamp or weather.retrieved_at

    # 5. Surface Meteorology & Boundary Layer Wind
    if weather.wind_speed_kmh is not None:
        wind_card = weather.wind_direction_cardinal or "Unknown"
        evidence_items["EVID-WEATHER-WIND"] = EnvironmentalEvidenceItem(
            evidence_id="EVID-WEATHER-WIND",
            parameter="Surface Wind",
            value=f"{weather.wind_speed_kmh:.1f}",
            unit="km/h",
            classification=weather.source_type,
            freshness=effective_weather_freshness,
            context_note=f"Wind speed {weather.wind_speed_kmh:.1f} km/h blowing from {wind_card} ({weather.wind_direction_degrees or 0:.0f}°).",
            timestamp=weather_ts,
            averaging_period="instantaneous"
        )

    # 6. Boundary Layer Mixing Height
    if weather.boundary_layer_height_meters is not None:
        blh_val = f"{int(weather.boundary_layer_height_meters)}"
        evidence_items["EVID-WEATHER-BLH"] = EnvironmentalEvidenceItem(
            evidence_id="EVID-WEATHER-BLH",
            parameter="Boundary Layer Mixing Height",
            value=blh_val,
            unit="meters",
            classification=weather.source_type,
            freshness=effective_weather_freshness,
            context_note=(
                f"Modelled atmospheric boundary layer mixing ceiling: {blh_val}m. "
                "Low ceilings (<250m) restrict vertical dispersion."
            ),
            timestamp=weather_ts,
            averaging_period="instantaneous"
        )

    # 7. Meteorological Dispersion & Stagnation Heuristic
    evidence_items["EVID-DISPERSION"] = EnvironmentalEvidenceItem(
        evidence_id="EVID-DISPERSION",
        parameter="Dispersion & Stagnation Conditions",
        value=dispersion_conditions,
        unit=None,
        classification=weather.source_type,
        freshness=effective_weather_freshness,
        context_note=disp_note,
        timestamp=weather_ts,
        averaging_period="instantaneous"
    )

    # Aggregate combined limitations
    combined_limitations: List[str] = []
    for lim in air_quality.limitations:
        if lim not in combined_limitations:
            combined_limitations.append(lim)
    for lim in weather.limitations:
        if lim not in combined_limitations:
            combined_limitations.append(lim)
    if not weather_usable and weather_unusable_reason:
        combined_limitations.append(f"Weather telemetry limitation: {weather_unusable_reason}")

    return EnvironmentalEvidenceContext(
        location=air_quality.location,
        source_type=air_quality.source_type,
        quality_status=air_quality.quality_status,
        retrieval_freshness=air_quality.retrieval_freshness,
        observation_freshness=air_quality.observation_freshness,
        forecast_validity=air_quality.forecast_validity,
        retrieved_at=air_quality.retrieved_at,
        observed_at=air_quality.observed_at,
        forecast_timestamp=air_quality.forecast_timestamp,
        weather_source_type=weather.source_type,
        weather_retrieval_freshness=weather.retrieval_freshness,
        weather_observation_freshness=weather.observation_freshness,
        weather_forecast_validity=weather.forecast_validity,
        weather_retrieved_at=weather.retrieved_at,
        weather_observed_at=weather.observed_at,
        weather_forecast_timestamp=weather.forecast_timestamp,
        weather_usable=weather_usable,
        weather_unusable_reason=weather_unusable_reason,
        evidence_items=evidence_items,
        indian_naqi=air_quality.indian_naqi,
        indian_naqi_category=air_quality.indian_naqi_category,
        dominant_pollutant=air_quality.dominant_pollutant,
        dominant_pollutant_reason=air_quality.dominant_pollutant_reason,
        stagnation_risk=stagnation_risk,
        dispersion_conditions=dispersion_conditions,
        limitations=combined_limitations
    )
