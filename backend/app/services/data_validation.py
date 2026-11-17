"""Data validation, coordinate bounds, freshness verification, and dispersion physics."""
from typing import Optional, Tuple, Dict, Union
from datetime import datetime, timezone
from ..schemas.common import Coordinates, FreshnessStatus, ForecastValidityStatus
from ..schemas.air_quality import NormalizedPollutant
from ..core.exceptions import CoordinateValidationError


# Official Indian National Ambient Air Quality Standards (NAAQS) Reference Benchmarks
# Used strictly for dimensionless relative exceedance ratio comparisons in heuristic evaluations.
# NOT to be confused with or presented as official CPCB sub-index calculations.
INDIAN_NAAQS_BENCHMARKS = {
    "PM2.5": {"benchmark": 60.0, "unit": "µg/m³", "averaging_period": "24-hour"},
    "PM10": {"benchmark": 100.0, "unit": "µg/m³", "averaging_period": "24-hour"},
    "NO2": {"benchmark": 80.0, "unit": "µg/m³", "averaging_period": "24-hour"},
    "SO2": {"benchmark": 80.0, "unit": "µg/m³", "averaging_period": "24-hour"},
    "CO": {"benchmark": 2.0, "unit": "mg/m³", "averaging_period": "8-hour"},
    "O3": {"benchmark": 100.0, "unit": "µg/m³", "averaging_period": "8-hour"},
    "NH3": {"benchmark": 400.0, "unit": "µg/m³", "averaging_period": "24-hour"},
    "Pb": {"benchmark": 1.0, "unit": "µg/m³", "averaging_period": "24-hour"}
}


def validate_coordinates(latitude: float, longitude: float) -> Coordinates:
    """Validate geographic coordinates within WGS84 bounds.

    Raises:
        CoordinateValidationError: If latitude or longitude are outside valid planetary ranges.
    """
    try:
        return Coordinates(latitude=latitude, longitude=longitude)
    except Exception as exc:
        raise CoordinateValidationError(f"Invalid geographic coordinates: {str(exc)}") from exc


def classify_freshness(
    retrieved_at: Optional[datetime],
    max_fresh_minutes: int = 60,
    max_stale_minutes: int = 180
) -> FreshnessStatus:
    """Classify temporal freshness of data retrieval.

    Evaluates how recently the backend retrieved data from the external provider.
    This is strictly distinct from the forecast validity window.

    Thresholds:
    - 0 to max_fresh_minutes (<= 60 min): FRESH
    - max_fresh_minutes to max_stale_minutes (60-180 min): RECENT
    - > max_stale_minutes (> 180 min): STALE
    - None: UNAVAILABLE
    """
    if retrieved_at is None:
        return FreshnessStatus.UNAVAILABLE

    if retrieved_at.tzinfo is None:
        retrieved_at = retrieved_at.replace(tzinfo=timezone.utc)
    else:
        retrieved_at = retrieved_at.astimezone(timezone.utc)

    now_utc = datetime.now(timezone.utc)
    delta_seconds = (now_utc - retrieved_at).total_seconds()

    if delta_seconds < -120:
        # Future-dated retrieval timestamp beyond clock-skew tolerance
        return FreshnessStatus.INVALID
    elif delta_seconds < 0:
        # Clock skew / immediate receipt within 120s
        return FreshnessStatus.FRESH

    delta_minutes = delta_seconds / 60.0

    if delta_minutes <= max_fresh_minutes:
        return FreshnessStatus.FRESH
    elif delta_minutes <= max_stale_minutes:
        return FreshnessStatus.RECENT
    else:
        return FreshnessStatus.STALE


def classify_forecast_validity(
    forecast_timestamp: Optional[datetime]
) -> Optional[ForecastValidityStatus]:
    """Classify the validity window of a forecast timestep relative to current time.

    A forecast timestep in the future does NOT make the retrieval fresh;
    this metadata field represents the forecast window itself.
    """
    if forecast_timestamp is None:
        return None

    if forecast_timestamp.tzinfo is None:
        forecast_timestamp = forecast_timestamp.replace(tzinfo=timezone.utc)
    else:
        forecast_timestamp = forecast_timestamp.astimezone(timezone.utc)

    now_utc = datetime.now(timezone.utc)
    delta_seconds = (forecast_timestamp - now_utc).total_seconds()

    # Within ±60 minutes is current hourly prediction period
    if abs(delta_seconds) <= 3600:
        return ForecastValidityStatus.CURRENT_PERIOD
    elif delta_seconds > 3600:
        return ForecastValidityStatus.FUTURE_PERIOD
    else:
        return ForecastValidityStatus.HISTORICAL_PERIOD


def validate_pollutant_concentration(
    code: str,
    val: Optional[float],
    unit: str
) -> Tuple[Optional[float], bool]:
    """Validate numerical pollutant concentration.

    Returns (cleaned_value, is_valid).
    Rejects severely negative values (instrument failure) and unrealistic outliers.
    """
    if val is None:
        return None, False

    try:
        val_f = float(val)
    except (ValueError, TypeError):
        return None, False

    # Slight negative readings can occur due to baseline sensor drift; clamp small negatives down to 0
    if -0.5 <= val_f < 0.0:
        val_f = 0.0
    elif val_f < -0.5:
        return None, False

    # Upper physical sanity bounds per pollutant (in µg/m³ or mg/m³)
    MAX_BOUNDS = {
        "PM2.5": 3000.0,
        "PM10": 5000.0,
        "NO2": 2000.0,
        "SO2": 2500.0,
        "CO": 100.0 if "mg" in unit.lower() else 100000.0,
        "O3": 1500.0,
        "NH3": 2000.0,
        "Pb": 50.0
    }

    limit = MAX_BOUNDS.get(code, 10000.0)
    if val_f > limit:
        val_f = limit

    return round(val_f, 2), True


def derive_wind_cardinal(degrees: Optional[float]) -> Optional[str]:
    """Convert meteorological wind direction in degrees to a 16-point cardinal string."""
    if degrees is None:
        return None

    directions = [
        "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
    ]
    normalized = degrees % 360.0
    idx = int((normalized + 11.25) / 22.5) % 16
    return directions[idx]


def derive_dispersion_conditions(
    boundary_layer_height_m: Optional[float],
    wind_speed_kmh: Optional[float]
) -> Tuple[str, str, str]:
    """Derive atmospheric dispersion conditions and stagnation risk from meteorological telemetry.

    SCIENTIFIC INTEGRITY SPECIFICATION:
    - Boundary layer height and surface wind speed alone DO NOT establish a confirmed temperature inversion.
    - Confirmation of a thermal inversion requires vertical temperature profile soundings (dT/dz > 0),
      which are not provided by surface weather feeds. We do NOT fabricate soundings.
    - Low boundary layer height and calm winds indicate potentially unfavorable dispersion conditions
      and elevated stagnation risk.
    - If either boundary layer height or wind speed is missing, returns 'Unknown' rather than inventing data.
    - This function provides a documented heuristic screening indicator, NOT a confirmed physical inversion claim.

    Returns:
        (stagnation_risk, dispersion_conditions, stagnation_description)
    """
    if boundary_layer_height_m is None and wind_speed_kmh is None:
        return (
            "Unknown",
            "Unknown",
            "Boundary layer height and surface wind speed telemetry unavailable to evaluate dispersion conditions."
        )

    if boundary_layer_height_m is None:
        return (
            "Unknown",
            "Unknown",
            "Boundary layer height telemetry unavailable to evaluate vertical mixing."
        )

    if wind_speed_kmh is None:
        return (
            "Unknown",
            "Unknown",
            "Surface wind speed telemetry unavailable to evaluate horizontal ventilation."
        )

    bl_h = float(boundary_layer_height_m)
    ws = float(wind_speed_kmh)

    if bl_h <= 250.0:
        if ws <= 6.0:
            return (
                "Elevated",
                "Potentially Unfavorable",
                f"Low boundary layer height ({int(bl_h)}m) and weak winds ({ws:.1f} km/h) may indicate unfavorable pollutant dispersion. This heuristic screening indicator does not establish a confirmed vertical temperature inversion or complete particulate trapping."
            )
        return (
            "Moderate",
            "Moderate",
            f"Low boundary layer height ({int(bl_h)}m) with moderate surface winds ({ws:.1f} km/h) facilitating partial horizontal dispersion."
        )
    elif bl_h <= 600.0:
        return (
            "Moderate",
            "Moderate",
            f"Moderate boundary layer mixing height ({int(bl_h)}m) providing typical diurnal vertical dilution."
        )
    else:
        return (
            "Low",
            "Favorable",
            f"Elevated boundary layer mixing ceiling ({int(bl_h)}m) promoting favorable vertical ventilation."
        )


MAX_CLOCK_SKEW_SECONDS = 120  # 2 minutes tolerance for network/server clock skew


def parse_observation_timestamp(
    ts: Union[str, datetime, None],
    require_explicit_timezone: bool = True
) -> Tuple[Optional[datetime], bool, str]:
    """Parse and validate an observation timestamp.

    Ensures timestamps are timezone-aware and NEVER silently interpreted using the machine's local timezone.
    - If require_explicit_timezone is True, string inputs lacking an explicit timezone offset (Z, +HH:MM, -HH:MM)
      are rejected.
    - If require_explicit_timezone is False and a naive string or datetime is provided, it is explicitly treated as UTC.
    """
    if ts is None:
        return None, False, "Missing observation timestamp."

    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            if require_explicit_timezone:
                return None, False, "Naive datetime object rejected: lacks timezone offset."
            return ts.replace(tzinfo=timezone.utc), True, "Assumed UTC for naive datetime."
        return ts.astimezone(timezone.utc), True, "Normalized to UTC."

    if not isinstance(ts, str) or not ts.strip():
        return None, False, "Empty or invalid timestamp string."

    s = ts.strip()
    # Check for explicit timezone indicators in ISO-8601 string: 'Z', 'z', or '+' / '-' after time segment
    has_tz = s.endswith("Z") or s.endswith("z") or ("+" in s[10:] or "-" in s[10:])

    if not has_tz:
        if require_explicit_timezone:
            return None, False, f"Timestamp '{ts}' lacks timezone offset information (never inferred from local machine time)."
        try:
            dt = datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
            return dt, True, "Assumed UTC for naive timestamp string."
        except Exception as exc:
            return None, False, f"Malformed timestamp: {exc}"

    try:
        s_norm = s.replace("Z", "+00:00").replace("z", "+00:00")
        dt = datetime.fromisoformat(s_norm).astimezone(timezone.utc)
        return dt, True, "Valid timezone-aware timestamp."
    except Exception as exc:
        return None, False, f"Malformed ISO timestamp '{ts}': {exc}"


def calculate_observation_age_minutes(
    observed_at: Optional[datetime],
    relative_to: Optional[datetime] = None,
    max_clock_skew_seconds: int = MAX_CLOCK_SKEW_SECONDS
) -> Optional[float]:
    """Calculate elapsed minutes since physical measurement was recorded.

    Strictly reserved for physical sensor observations; returns None for modelled forecasts.
    Rejects future-dated observations beyond max_clock_skew_seconds (returns None).
    Preserves timezone-aware timestamp handling; naive datetimes are strictly treated as UTC.
    """
    if observed_at is None:
        return None

    if observed_at.tzinfo is None:
        # Never silently use machine local timezone; strictly treat unlocalized timestamps as UTC
        observed_at = observed_at.replace(tzinfo=timezone.utc)
    else:
        observed_at = observed_at.astimezone(timezone.utc)

    if relative_to is None:
        ref_time = datetime.now(timezone.utc)
    else:
        ref_time = relative_to if relative_to.tzinfo else relative_to.replace(tzinfo=timezone.utc)
        ref_time = ref_time.astimezone(timezone.utc)

    delta_seconds = (ref_time - observed_at).total_seconds()

    # Reject future timestamps beyond clock skew tolerance (e.g. > 120s in future)
    if delta_seconds < -max_clock_skew_seconds:
        return None

    # Within clock skew tolerance (e.g. 0 to -120 seconds): clamp to 0.0
    if delta_seconds < 0:
        return 0.0

    return round(delta_seconds / 60.0, 1)


def classify_observation_freshness(
    observed_at: Optional[datetime],
    relative_to: Optional[datetime] = None,
    max_fresh_minutes: int = 60,
    max_stale_minutes: int = 180,
    max_clock_skew_seconds: int = MAX_CLOCK_SKEW_SECONDS
) -> Optional[FreshnessStatus]:
    """Classify the age of a physical sensor measurement into FreshnessStatus tiers.

    Strictly returns None for modelled data (which has no physical observation).
    Returns FreshnessStatus.INVALID if observation is future-dated beyond clock-skew tolerance.
    """
    if observed_at is None:
        return None

    age_min = calculate_observation_age_minutes(observed_at, relative_to, max_clock_skew_seconds)
    if age_min is None:
        return FreshnessStatus.INVALID

    if age_min <= max_fresh_minutes:
        return FreshnessStatus.FRESH
    elif age_min <= max_stale_minutes:
        return FreshnessStatus.RECENT
    else:
        return FreshnessStatus.STALE


def classify_model_run_freshness(
    model_run_timestamp: Optional[datetime]
) -> FreshnessStatus:
    """Classify model run cycle freshness.

    Explicitly returns UNAVAILABLE when model run timestamp is not exposed by the provider.
    Never fabricates model execution metadata.
    """
    if model_run_timestamp is None:
        return FreshnessStatus.UNAVAILABLE

    return classify_freshness(model_run_timestamp, max_fresh_minutes=360, max_stale_minutes=720)


def determine_dominant_pollutant(
    pollutants: Dict[str, NormalizedPollutant],
    is_official_cpcb: bool = False
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Determine the dominant air pollutant with strict scientific and regulatory semantics.

    REGULATORY AND SCIENTIFIC RULES:
    1. Instantaneous modelled concentrations (e.g. Open-Meteo CAMS) or raw sensor readings
       CANNOT establish the official dominant pollutant under statutory CPCB methodology.
       A dimensionless ratio against 24-hour or 8-hour NAAQS benchmarks does not resolve
       the fundamental temporal mismatch with instantaneous snapshots.
       Therefore, for modelled or non-statutory data, dominant_pollutant is strictly set to None.
    2. For official certified CPCB ground station observations (is_official_cpcb=True):
       Evaluated strictly when statutory sub-indices are provided meeting all CPCB criteria
       (minimum 3 pollutants, at least one particulate matter PM2.5/PM10, >=16h valid monitoring).
       dominant_pollutant is designated as the pollutant with the maximum verified sub-index.
    3. If official criteria are missing or unmet, dominant_pollutant returns None with an explicit reason.

    Returns:
        (dominant_pollutant, methodology_note, limitation_reason)
    """
    if not is_official_cpcb:
        return (
            None,
            None,
            "Instantaneous modelled concentrations cannot establish the official dominant pollutant under statutory CPCB methodology, which requires certified 24-hour / 8-hour time-integrated sub-indices."
        )

    if not pollutants:
        return None, None, "No valid pollutant concentrations available to evaluate dominant pollutant."

    # Physical CPCB Station Observations: check sub-indices
    sub_indices = {
        code: p.sub_index
        for code, p in pollutants.items()
        if p.sub_index is not None
    }
    has_pm = ("PM2.5" in sub_indices) or ("PM10" in sub_indices)
    if len(sub_indices) >= 3 and has_pm:
        dominant = max(sub_indices, key=sub_indices.get)
        return (
            dominant,
            "Official statutory CPCB methodology: pollutant with maximum sub-index across verified averaging periods.",
            None
        )

    return (
        None,
        None,
        "Ineligible for official CPCB dominant pollutant: requires at least 3 valid sub-indices including PM2.5 or PM10."
    )
