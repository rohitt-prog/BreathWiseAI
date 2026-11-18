"""Deterministic Safety & Action Eligibility Engine for BreatheWise AI.

Authoritative pre-generation and post-generation safety rules.
Enforces that Gemini:
1. Operates only within an allowlist of eligible canonical actions.
2. Adheres to strict environmental health and atmospheric physics boundaries.
3. Cannot override prohibited actions, alter canonical titles/rationales, or invent unverified evidence.
4. Cannot invent or alter numerical telemetry claims (pollutants, wind, mixing height, NAQI).
5. Falls back to deterministic safe recommendations when data is invalid, stale, or unavailable.
"""
import re
import math
import unicodedata
from typing import Dict, List, Set, Tuple, Optional, Union, Any
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass
from ..schemas.common import DataClassification, FreshnessStatus, ForecastValidityStatus, QualityStatus
from ..schemas.weather import NormalizedWeatherResponse
from ..schemas.ai import (
    ActivityContext,
    ActionCategory,
    ActionPriority,
    AIInsightAction,
    EnvironmentalEvidenceContext,
    EnvironmentalEvidenceItem
)


@dataclass(frozen=True)
class CanonicalAction:
    action_id: str
    category: ActionCategory
    priority: ActionPriority
    title: str
    rationale: str
    required_evidence_keys: Tuple[str, ...]
    allowed_evidence_keys: Tuple[str, ...]
    fallback_priority: int  # Ordering preference for fallback selection


# Master catalog of permissible, science-backed environmental mitigation actions
CANONICAL_ACTIONS: Dict[str, CanonicalAction] = {
    "ACT-VENT-SEAL-TEMPORARY": CanonicalAction(
        action_id="ACT-VENT-SEAL-TEMPORARY",
        category=ActionCategory.VENTILATION,
        priority=ActionPriority.HIGH,
        title="Temporarily close external windows during peak ambient particulate stagnation",
        rationale="Prevents rapid infiltration of ambient PM2.5 and combustion aerosols into living spaces during low boundary layer mixing.",
        required_evidence_keys=("EVID-PM25", "EVID-DISPERSION"),
        allowed_evidence_keys=("EVID-PM25", "EVID-PM10", "EVID-DISPERSION", "EVID-WEATHER-BLH", "EVID-NAQI"),
        fallback_priority=1
    ),
    "ACT-VENT-NATURAL-CROSS": CanonicalAction(
        action_id="ACT-VENT-NATURAL-CROSS",
        category=ActionCategory.VENTILATION,
        priority=ActionPriority.MEDIUM,
        title="Conduct short, targeted cross-ventilation when indoor air needs purge",
        rationale="Brief 10-15 minute cross-ventilation balances outdoor particulate ingress against indoor CO2, moisture, and VOC accumulation. Continuous sealing without air exchange deteriorates indoor air quality.",
        required_evidence_keys=("EVID-PM25",),
        allowed_evidence_keys=("EVID-PM25", "EVID-PM10", "EVID-DISPERSION", "EVID-WEATHER-WIND", "EVID-NAQI"),
        fallback_priority=3
    ),
    "ACT-VENT-PURIFY-HEPA": CanonicalAction(
        action_id="ACT-VENT-PURIFY-HEPA",
        category=ActionCategory.INDOOR_AIR,
        priority=ActionPriority.HIGH,
        title="Operate mechanical HEPA air filtration continuously in recirculating mode",
        rationale="True HEPA filtration removes >99.97% of PM2.5 without generating harmful ozone byproducts, maintaining safe indoor baseline levels.",
        required_evidence_keys=("EVID-PM25",),
        allowed_evidence_keys=("EVID-PM25", "EVID-PM10", "EVID-NAQI"),
        fallback_priority=2
    ),
    "ACT-INDOOR-SOURCE-CONTROL": CanonicalAction(
        action_id="ACT-INDOOR-SOURCE-CONTROL",
        category=ActionCategory.INDOOR_AIR,
        priority=ActionPriority.MEDIUM,
        title="Eliminate indoor combustion sources and operate kitchen exhaust range hoods",
        rationale="Cooking emissions, unvented frying, incense, and candles produce intense localized PM2.5 and ultrafine particle spikes that equal or exceed outdoor concentrations.",
        required_evidence_keys=(),
        allowed_evidence_keys=("EVID-PM25", "EVID-PM10"),
        fallback_priority=4
    ),
    "ACT-EXERCISE-INDOOR-CARDIO": CanonicalAction(
        action_id="ACT-EXERCISE-INDOOR-CARDIO",
        category=ActionCategory.OUTDOOR_ACTIVITY,
        priority=ActionPriority.HIGH,
        title="Shift vigorous cardiovascular workouts to indoor spaces with air filtration",
        rationale="Heavy breathing during intense running or cycling increases minute respiratory volume by 5-10x, drastically amplifying deep lung particulate deposition.",
        required_evidence_keys=("EVID-PM25",),
        allowed_evidence_keys=("EVID-PM25", "EVID-PM10", "EVID-NAQI", "EVID-DISPERSION"),
        fallback_priority=2
    ),
    "ACT-EXERCISE-RESCHEDULE": CanonicalAction(
        action_id="ACT-EXERCISE-RESCHEDULE",
        category=ActionCategory.OUTDOOR_ACTIVITY,
        priority=ActionPriority.MEDIUM,
        title="Reschedule non-strenuous outdoor activities to peak mixing hours (afternoon)",
        rationale="Solar heating raises the atmospheric boundary layer ceiling during afternoon hours, promoting vertical dilution compared to shallow morning stagnation.",
        required_evidence_keys=("EVID-WEATHER-BLH", "EVID-DISPERSION"),
        allowed_evidence_keys=("EVID-WEATHER-BLH", "EVID-DISPERSION", "EVID-WEATHER-WIND", "EVID-PM25"),
        fallback_priority=5
    ),
    "ACT-EXERCISE-MODERATE-OUTDOOR": CanonicalAction(
        action_id="ACT-EXERCISE-MODERATE-OUTDOOR",
        category=ActionCategory.OUTDOOR_ACTIVITY,
        priority=ActionPriority.LOW,
        title="Casual outdoor walking is permissible away from heavy traffic corridors",
        rationale="Moderate, nasal-breathing movement does not carry the severe hyperventilation penalty of strenuous workouts; choose green spaces or quiet neighborhood roads.",
        required_evidence_keys=(),
        allowed_evidence_keys=("EVID-PM25", "EVID-DISPERSION", "EVID-WEATHER-WIND"),
        fallback_priority=6
    ),
    "ACT-PROTECT-N95-STREET": CanonicalAction(
        action_id="ACT-PROTECT-N95-STREET",
        category=ActionCategory.PERSONAL_PROTECTION,
        priority=ActionPriority.HIGH,
        title="Wear a certified, well-fitted N95 or FFP2 respirator for outdoor street transit",
        rationale="Certified respirators filter sub-micron particles with high efficiency when properly sealed; cloth and surgical masks offer negligible protection against fine combustion particles.",
        required_evidence_keys=("EVID-PM25",),
        allowed_evidence_keys=("EVID-PM25", "EVID-PM10", "EVID-NAQI", "EVID-DISPERSION"),
        fallback_priority=1
    ),
    "ACT-COMMUTE-REDUCE-EXPOSURE": CanonicalAction(
        action_id="ACT-COMMUTE-REDUCE-EXPOSURE",
        category=ActionCategory.COMMUTE,
        priority=ActionPriority.HIGH,
        title="Prioritize enclosed transit with filtered air over open two-wheeler or roadside commuting",
        rationale="Motorcycles, auto-rickshaws, and walking along heavy vehicle corridors result in direct, unbuffered exposure to fresh vehicle tailpipe emissions and black carbon.",
        required_evidence_keys=("EVID-PM25",),
        allowed_evidence_keys=("EVID-PM25", "EVID-PM10", "EVID-NAQI"),
        fallback_priority=3
    ),
    "ACT-COMMUTE-SEPARATION": CanonicalAction(
        action_id="ACT-COMMUTE-SEPARATION",
        category=ActionCategory.COMMUTE,
        priority=ActionPriority.MEDIUM,
        title="Plan travel routes avoiding congested highway choke points and arterial diesel routes",
        rationale="Pollutant concentrations drop sharply with distance from arterial road edges; navigating residential interior roads reduces direct peak aerosol exposure.",
        required_evidence_keys=(),
        allowed_evidence_keys=("EVID-PM25", "EVID-WEATHER-WIND"),
        fallback_priority=7
    ),
    "ACT-VENT-MONITOR-BASELINE": CanonicalAction(
        action_id="ACT-VENT-MONITOR-BASELINE",
        category=ActionCategory.VENTILATION,
        priority=ActionPriority.INFO,
        title="Ventilation conditions are currently acceptable; monitor changing diurnal trends",
        rationale="Ambient particulate levels and boundary layer dispersion are currently favorable. Standard natural ventilation is suitable.",
        required_evidence_keys=("EVID-DISPERSION",),
        allowed_evidence_keys=("EVID-DISPERSION", "EVID-WEATHER-WIND", "EVID-WEATHER-BLH", "EVID-PM25"),
        fallback_priority=8
    )
}

# Strictly prohibited guidance keywords and claims
PROHIBITED_PHRASES = [
    "ozone generator",
    "ozone air purifier",
    "ozone disinfection",
    "ionizer producing ozone",
    "cure asthma",
    "cure lung disease",
    "medical diagnosis",
    "prescribe",
    "stop taking your medication",
    "completely forbidden from stepping outside",
    "all outdoor movement is prohibited",
    "cycling in traffic reduces your exposure",
    "sustainable commute reduces your inhaled pollution"
]

# Patterns for misleading or dangerous rationales attached to actions
MISLEADING_RATIONALE_PATTERNS = [
    r"\bcloth\s+(?:mask|bandana|covering)s?\s+(?:offer|provide|give|are)\s+(?:complete|total|high|sufficient|just\s+as\s+good|equal|adequate)\b",
    r"\bcycling\s+(?:in\s+traffic\s+)?reduces\s+(?:your\s+)?(?:exposure|inhaled\s+pollution)\b",
    r"\bpermanently\s+seal\s+(?:all\s+)?windows\b",
    r"\bnever\s+open\s+windows\s+again\b",
    r"\bcompletely\s+safe\s+to\s+exercise\s+outdoors\b",
    r"\bno\s+need\s+for\s+(?:air\s+purification|hepa)\b",
    r"\bozone\b.*?\b(?:purif|clean|steriliz)\b"
]

# Supported criteria pollutants configuration for rigorous evidence grounding
# Permitted temporal boundaries for modelled atmospheric and weather telemetry
# Forecast horizon aligns with Open-Meteo CAMS 48-hour hourly forecast schedule (forecast_days = 2).
MAX_FORECAST_FUTURE_HOURS: int = 48
MAX_FORECAST_FUTURE_SECONDS: int = MAX_FORECAST_FUTURE_HOURS * 3600  # 172,800 seconds (48 hours)

# Modelled hourly predictions older than 60 minutes are classified as historical (HISTORICAL_PERIOD).
MAX_FORECAST_PAST_SECONDS: int = 3600  # 60 minutes

# Strict fail-closed allowlist of approved freshness states for numerical claim validation
ALLOWED_CLAIM_FRESHNESS: Tuple[FreshnessStatus, ...] = (
    FreshnessStatus.FRESH,
    FreshnessStatus.RECENT,
)

SUPPORTED_POLLUTANTS_CONFIG: Dict[str, Dict[str, Any]] = {
    "PM2.5": {
        "evid_key": "EVID-PM25",
        "aliases": [r"pm2\.?5", r"pm\s+2\.?5", r"fine\s+particulates?", r"fine\s+particles?"],
        "valid_units": [r"[µμu]g\s*/\s*m[3³]", r"micrograms?\s*(?:per\s+cubic\s+meter|/\s*m[3³])"],
        "incompatible_units": [
            r"ppm\b", r"ppb\b", r"mg\s*/\s*m[3³]\b", r"%",
            r"[µμu]g\b(?!\s*/\s*m)",
            r"micrograms?\b(?!\s*(?:per|/\s*m))",
            r"mg\b(?!\s*/\s*m)",
            r"milligrams?\b(?!\s*(?:per|/\s*m))"
        ],
        "tolerance": 2.5,
        "default_unit": "µg/m³",
        "standard_period": "24-hour"
    },
    "PM10": {
        "evid_key": "EVID-PM10",
        "aliases": [r"pm10", r"pm\s+10", r"coarse\s+particulates?", r"respirable\s+suspended\s+particulates?"],
        "valid_units": [r"[µμu]g\s*/\s*m[3³]", r"micrograms?\s*(?:per\s+cubic\s+meter|/\s*m[3³])"],
        "incompatible_units": [
            r"ppm\b", r"ppb\b", r"mg\s*/\s*m[3³]\b", r"%",
            r"[µμu]g\b(?!\s*/\s*m)",
            r"micrograms?\b(?!\s*(?:per|/\s*m))",
            r"mg\b(?!\s*/\s*m)",
            r"milligrams?\b(?!\s*(?:per|/\s*m))"
        ],
        "tolerance": 2.5,
        "default_unit": "µg/m³",
        "standard_period": "24-hour"
    },
    "NO2": {
        "evid_key": "EVID-NO2",
        "aliases": [r"\bno2\b", r"nitrogen\s+dioxide", r"\bno_2\b"],
        "valid_units": [r"[µμu]g\s*/\s*m[3³]", r"micrograms?\s*(?:per\s+cubic\s+meter|/\s*m[3³])"],
        "incompatible_units": [
            r"ppm\b", r"ppb\b", r"mg\s*/\s*m[3³]\b", r"%",
            r"[µμu]g\b(?!\s*/\s*m)",
            r"micrograms?\b(?!\s*(?:per|/\s*m))",
            r"mg\b(?!\s*/\s*m)",
            r"milligrams?\b(?!\s*(?:per|/\s*m))"
        ],
        "tolerance": 2.5,
        "default_unit": "µg/m³",
        "standard_period": "24-hour"
    },
    "SO2": {
        "evid_key": "EVID-SO2",
        "aliases": [r"\bso2\b", r"sulphur\s+dioxide", r"sulfur\s+dioxide", r"\bso_2\b"],
        "valid_units": [r"[µμu]g\s*/\s*m[3³]", r"micrograms?\s*(?:per\s+cubic\s+meter|/\s*m[3³])"],
        "incompatible_units": [
            r"ppm\b", r"ppb\b", r"mg\s*/\s*m[3³]\b", r"%",
            r"[µμu]g\b(?!\s*/\s*m)",
            r"micrograms?\b(?!\s*(?:per|/\s*m))",
            r"mg\b(?!\s*/\s*m)",
            r"milligrams?\b(?!\s*(?:per|/\s*m))"
        ],
        "tolerance": 2.5,
        "default_unit": "µg/m³",
        "standard_period": "24-hour"
    },
    "CO": {
        "evid_key": "EVID-CO",
        "aliases": [r"\bco\b", r"carbon\s+monoxide"],
        "valid_units": [r"mg\s*/\s*m[3³]", r"milligrams?\s*(?:per\s+cubic\s+meter|/\s*m[3³])"],
        "incompatible_units": [
            r"[µμu]g\s*/\s*m[3³]\b", r"ppm\b", r"ppb\b", r"%",
            r"mg\b(?!\s*/\s*m)",
            r"milligrams?\b(?!\s*(?:per|/\s*m))",
            r"[µμu]g\b(?!\s*/\s*m)",
            r"micrograms?\b(?!\s*(?:per|/\s*m))"
        ],
        "tolerance": 0.5,
        "default_unit": "mg/m³",
        "standard_period": "8-hour"
    },
    "O3": {
        "evid_key": "EVID-O3",
        "aliases": [r"\bo3\b", r"surface\s+ozone", r"ground-level\s+ozone", r"\bozone\b", r"\bo_3\b"],
        "valid_units": [r"[µμu]g\s*/\s*m[3³]", r"micrograms?\s*(?:per\s+cubic\s+meter|/\s*m[3³])"],
        "incompatible_units": [
            r"ppm\b", r"ppb\b", r"mg\s*/\s*m[3³]\b", r"%",
            r"[µμu]g\b(?!\s*/\s*m)",
            r"micrograms?\b(?!\s*(?:per|/\s*m))",
            r"mg\b(?!\s*/\s*m)",
            r"milligrams?\b(?!\s*(?:per|/\s*m))"
        ],
        "tolerance": 2.5,
        "default_unit": "µg/m³",
        "standard_period": "8-hour"
    },
    "NH3": {
        "evid_key": "EVID-NH3",
        "aliases": [r"\bnh3\b", r"ammonia", r"\bnh_3\b"],
        "valid_units": [r"[µμu]g\s*/\s*m[3³]", r"micrograms?\s*(?:per\s+cubic\s+meter|/\s*m[3³])"],
        "incompatible_units": [
            r"ppm\b", r"ppb\b", r"mg\s*/\s*m[3³]\b", r"%",
            r"[µμu]g\b(?!\s*/\s*m)",
            r"micrograms?\b(?!\s*(?:per|/\s*m))",
            r"mg\b(?!\s*/\s*m)",
            r"milligrams?\b(?!\s*(?:per|/\s*m))"
        ],
        "tolerance": 5.0,
        "default_unit": "µg/m³",
        "standard_period": "24-hour"
    },
    "Pb": {
        "evid_key": "EVID-PB",
        "aliases": [r"\bpb\b", r"\blead\b", r"lead\s+(?:particulates?|concentration|level|metal|pollution|exposure|aerosol)"],
        "valid_units": [r"[µμu]g\s*/\s*m[3³]", r"micrograms?\s*(?:per\s+cubic\s+meter|/\s*m[3³])"],
        "incompatible_units": [
            r"ppm\b", r"ppb\b", r"mg\s*/\s*m[3³]\b", r"%",
            r"[µμu]g\b(?!\s*/\s*m)",
            r"micrograms?\b(?!\s*(?:per|/\s*m))",
            r"mg\b(?!\s*/\s*m)",
            r"milligrams?\b(?!\s*(?:per|/\s*m))"
        ],
        "tolerance": 0.2,
        "default_unit": "µg/m³",
        "standard_period": "24-hour"
    }
}


class DeterministicSafetyEngine:
    """Evaluates telemetry usability, constructs allowed action sets, and validates AI outputs."""

    @staticmethod
    def evaluate_weather_usability(
        weather: Union[NormalizedWeatherResponse, EnvironmentalEvidenceContext]
    ) -> Tuple[bool, FreshnessStatus, Optional[str]]:
        """Authoritative weather usability evaluation strictly validating temporal provenance and forecast validity.

        Returns (is_usable, effective_freshness, reason_if_unusable).
        """
        now_utc = datetime.now(timezone.utc)

        # Normalize attributes based on input type
        if isinstance(weather, EnvironmentalEvidenceContext):
            src_type = weather.weather_source_type or weather.source_type
            retrieved_at = weather.weather_retrieved_at or weather.retrieved_at
            observed_at = weather.weather_observed_at or weather.observed_at
            forecast_ts = weather.weather_forecast_timestamp or weather.forecast_timestamp
            retrieval_freshness = weather.weather_retrieval_freshness or weather.retrieval_freshness
            obs_freshness = weather.weather_observation_freshness or weather.observation_freshness
            forecast_validity = weather.weather_forecast_validity or weather.forecast_validity
        else:
            src_type = weather.source_type
            retrieved_at = weather.retrieved_at
            observed_at = weather.observed_at
            forecast_ts = weather.forecast_timestamp
            retrieval_freshness = weather.retrieval_freshness
            obs_freshness = weather.observation_freshness
            forecast_validity = weather.forecast_validity

        # Check Simulated Demo
        if src_type == DataClassification.SIMULATED_DEMO:
            return True, FreshnessStatus.FRESH, None

        # 1. PHYSICAL OBSERVATIONS
        if src_type == DataClassification.OBSERVATION:
            # Rule 1: Must have a valid observation timestamp
            if observed_at is None:
                return False, FreshnessStatus.UNAVAILABLE, "Weather observation timestamp is missing; cannot treat observation as fresh."

            if not isinstance(observed_at, datetime):
                return False, FreshnessStatus.INVALID, "Weather observation timestamp is malformed."

            # Require timezone-aware timestamp; reject naive datetimes
            if observed_at.tzinfo is None or observed_at.tzinfo.utcoffset(observed_at) is None:
                return False, FreshnessStatus.INVALID, "Weather observation timestamp must be timezone-aware; naive datetimes are rejected."

            obs_dt = observed_at.astimezone(timezone.utc)

            # Rule 2: Reject future-dated observations (>5 mins future)
            if obs_dt > now_utc + timedelta(minutes=5):
                return False, FreshnessStatus.INVALID, f"Weather observation timestamp {obs_dt.isoformat()} is future-dated beyond clock-skew tolerance."

            # Rule 3: Reject expired observations (>180 mins old)
            obs_age_seconds = (now_utc - obs_dt).total_seconds()
            if obs_age_seconds > 180 * 60:
                return False, FreshnessStatus.STALE, f"Weather observation is expired/stale ({obs_age_seconds / 60:.1f} minutes old > 180 minutes threshold)."

            # Rule 4: If incoming observation freshness flag is STALE/INVALID/UNAVAILABLE, do not trust it as fresh
            if obs_freshness in (FreshnessStatus.STALE, FreshnessStatus.INVALID, FreshnessStatus.UNAVAILABLE):
                return False, obs_freshness, f"Weather observation freshness is {obs_freshness.value}."

            # Check retrieval timestamp if available
            if retrieved_at is not None:
                if not isinstance(retrieved_at, datetime):
                    return False, FreshnessStatus.INVALID, "Weather retrieval timestamp is malformed."
                if retrieved_at.tzinfo is None or retrieved_at.tzinfo.utcoffset(retrieved_at) is None:
                    return False, FreshnessStatus.INVALID, "Weather retrieval timestamp must be timezone-aware; naive datetimes are rejected."
                ret_dt = retrieved_at.astimezone(timezone.utc)
                if ret_dt > now_utc + timedelta(minutes=5):
                    return False, FreshnessStatus.INVALID, "Weather retrieval timestamp is future-dated beyond clock-skew tolerance."
                if (now_utc - ret_dt).total_seconds() > 180 * 60:
                    return False, FreshnessStatus.STALE, "Weather retrieval timestamp is stale (>180 minutes old)."

            effective = FreshnessStatus.FRESH if obs_age_seconds <= 60 * 60 else FreshnessStatus.RECENT
            return True, effective, None

        # 2. MODELLED FORECASTS
        # Rule 1: Validate retrieval timestamp
        if retrieved_at is None:
            return False, FreshnessStatus.UNAVAILABLE, "Weather retrieval timestamp is missing."

        if not isinstance(retrieved_at, datetime):
            return False, FreshnessStatus.INVALID, "Weather retrieval timestamp is malformed."

        if retrieved_at.tzinfo is None or retrieved_at.tzinfo.utcoffset(retrieved_at) is None:
            return False, FreshnessStatus.INVALID, "Weather retrieval timestamp must be timezone-aware; naive datetimes are rejected."

        ret_dt = retrieved_at.astimezone(timezone.utc)
        if ret_dt > now_utc + timedelta(minutes=5):
            return False, FreshnessStatus.INVALID, f"Weather forecast retrieval timestamp {ret_dt.isoformat()} is future-dated beyond clock-skew tolerance."

        ret_age_seconds = (now_utc - ret_dt).total_seconds()
        if ret_age_seconds > 180 * 60:
            return False, FreshnessStatus.STALE, f"Weather forecast retrieval is stale ({ret_age_seconds / 60:.1f} minutes old > 180 minutes threshold)."

        if retrieval_freshness in (FreshnessStatus.STALE, FreshnessStatus.INVALID, FreshnessStatus.UNAVAILABLE):
            return False, retrieval_freshness, f"Weather retrieval freshness flag is {retrieval_freshness.value}."

        # Rule 2: Mandatory forecast timestamp provenance (cannot substitute enum for actual timestamp)
        if forecast_ts is None:
            return False, FreshnessStatus.UNAVAILABLE, "Missing weather forecast timestamp; enum validity status cannot substitute for an actual timestamp."

        if not isinstance(forecast_ts, datetime):
            return False, FreshnessStatus.INVALID, "Weather forecast timestamp is malformed."

        if forecast_ts.tzinfo is None or forecast_ts.tzinfo.utcoffset(forecast_ts) is None:
            return False, FreshnessStatus.INVALID, "Weather forecast timestamp must be timezone-aware; naive datetimes are rejected."

        fc_dt = forecast_ts.astimezone(timezone.utc)
        delta_fc = (fc_dt - now_utc).total_seconds()

        # Rule 3: Check expired forecast (>60 minutes in historical past)
        if delta_fc < -MAX_FORECAST_PAST_SECONDS:
            return False, FreshnessStatus.STALE, f"Weather forecast timestep {fc_dt.isoformat()} is expired ({abs(delta_fc)/60:.1f} minutes in the past)."

        # Check future forecast boundary (>48 hours in future)
        if delta_fc > MAX_FORECAST_FUTURE_SECONDS:
            return False, FreshnessStatus.INVALID, f"Weather forecast timestep {fc_dt.isoformat()} exceeds maximum permitted forecast horizon ({delta_fc/3600:.1f} hours > {MAX_FORECAST_FUTURE_HOURS} hours)."

        # Rule 4: Validate forecast_validity enum and check for contradictory metadata
        if forecast_validity is not None:
            if forecast_validity == ForecastValidityStatus.HISTORICAL_PERIOD:
                return False, FreshnessStatus.STALE, "Weather forecast is expired (HISTORICAL_PERIOD); not valid for current guidance."
            elif forecast_validity == ForecastValidityStatus.CURRENT_PERIOD:
                if abs(delta_fc) > 3600:
                    return False, FreshnessStatus.INVALID, f"Contradictory forecast validity: marked CURRENT_PERIOD but forecast timestamp is {delta_fc/3600:.1f} hours away from current time."
            elif forecast_validity == ForecastValidityStatus.FUTURE_PERIOD:
                if delta_fc <= 3600:
                    return False, FreshnessStatus.INVALID, "Contradictory forecast validity: marked FUTURE_PERIOD but forecast timestamp is within current or past period."
            else:
                return False, FreshnessStatus.INVALID, f"Weather forecast validity is invalid or inapplicable ({forecast_validity.value})."

        effective = FreshnessStatus.FRESH if (forecast_validity == ForecastValidityStatus.FUTURE_PERIOD or delta_fc > 3600 or ret_age_seconds <= 60 * 60) else FreshnessStatus.RECENT
        return True, effective, None

    @staticmethod
    def evaluate_usability(
        evidence: EnvironmentalEvidenceContext
    ) -> Tuple[bool, Optional[str]]:
        """Determine whether the underlying environmental telemetry is usable for AI synthesis.

        Strictly evaluates primary air quality telemetry usability.
        Weather usability is evaluated independently via evaluate_weather_usability,
        ensuring stale weather does not unnecessarily invalidate fresh air quality telemetry.
        """
        # 1. Invalid data
        if evidence.retrieval_freshness == FreshnessStatus.INVALID:
            return False, "Environmental telemetry retrieval is timestamped with invalid future clock skew."

        if evidence.observation_freshness == FreshnessStatus.INVALID:
            return False, "Ground observation timestamp is invalid or future-dated beyond clock-skew limits."

        # 2. Stale data (exceeding 180 minutes)
        if evidence.retrieval_freshness == FreshnessStatus.STALE:
            return False, "Environmental air quality telemetry is stale (>180 minutes old). Real-time synthesis unavailable."

        if evidence.observation_freshness == FreshnessStatus.STALE:
            return False, "Ground sensor air quality observation is stale (>180 minutes old). Real-time synthesis unavailable."

        # 3. Missing critical evidence
        if not evidence.evidence_items:
            return False, "No valid environmental evidence points available in telemetry."

        # 4. Check whether criteria pollutants are present
        has_pollutants = any(
            k.startswith("EVID-PM") or k.startswith("EVID-NO2") or k.startswith("EVID-O3") or k.startswith("EVID-SO2") or k.startswith("EVID-CO")
            for k in evidence.evidence_items.keys()
        )
        if not has_pollutants:
            return False, "Incomplete telemetry: criteria pollutant concentrations are entirely missing."

        return True, None

    @staticmethod
    def determine_eligible_actions(
        evidence: EnvironmentalEvidenceContext,
        activity_context: ActivityContext,
        telemetry_usable: bool = True
    ) -> Tuple[Set[str], List[str]]:
        """Determine the allowlist of permissible action IDs and mandatory safety constraints.

        Returns (eligible_action_ids, safety_rules_for_prompt).
        """
        eligible_ids: Set[str] = set()
        safety_rules: List[str] = []

        # If telemetry is stale or invalid, strictly restrict to baseline telemetry-independent actions
        if not telemetry_usable:
            eligible_ids.add("ACT-INDOOR-SOURCE-CONTROL")
            eligible_ids.add("ACT-COMMUTE-SEPARATION")
            eligible_ids.add("ACT-EXERCISE-MODERATE-OUTDOOR")
            safety_rules.append("CRITICAL: Real-time telemetry is unverified (stale or invalid). Recommend ONLY baseline protective actions without assuming current pollution levels.")
            return eligible_ids, safety_rules

        # Extract numerical PM2.5 concentration if present and fresh
        pm25_val: Optional[float] = None
        if "EVID-PM25" in evidence.evidence_items:
            item = evidence.evidence_items["EVID-PM25"]
            if item.freshness in (FreshnessStatus.FRESH, FreshnessStatus.RECENT):
                try:
                    pm25_val = float(item.value)
                except ValueError:
                    pm25_val = None

        # Check weather dispersion freshness
        disp_fresh = (
            evidence.weather_usable
            and "EVID-DISPERSION" in evidence.evidence_items
            and evidence.evidence_items["EVID-DISPERSION"].freshness in (FreshnessStatus.FRESH, FreshnessStatus.RECENT)
        )
        is_stagnant = disp_fresh and (
            evidence.stagnation_risk in ("Elevated", "Moderate")
            or evidence.dispersion_conditions == "Potentially Unfavorable"
        )

        # Mandatory Universal Safety Rules
        safety_rules.append("CRITICAL: NEVER recommend ozone generators, ozone purifiers, or uncertified electronic ionizers under any circumstances.")
        safety_rules.append("CRITICAL: Do NOT universally advise permanent, unconditional window sealing. You MUST balance particulate ingress with indoor pollutant buildup (cooking, CO2, moisture). Mention kitchen exhaust and HEPA air purification.")
        safety_rules.append("CRITICAL: Do NOT claim all outdoor cardiovascular activity is unconditionally prohibited. Differentiate strenuous high-intensity exercise (which should move indoors) from non-strenuous outdoor walking.")
        safety_rules.append("CRITICAL: Distinguish personal exposure reduction from global emissions reduction. Never claim cycling or walking in traffic reduces an individual's personal pollution intake.")
        safety_rules.append("CRITICAL: Do NOT provide clinical medical diagnoses or medication advice.")
        safety_rules.append("CRITICAL: Do NOT claim that instantaneous or hourly modelled concentrations constitute an official 24-hour NAAQS regulatory violation or CPCB standard exceedance. Indian NAAQS (60 µg/m³) is a 24-hour statutory average. Frame recommendations around personal exposure risk during current conditions.")
        safety_rules.append("CRITICAL: Do NOT describe regional numerical model predictions (e.g. Open-Meteo CAMS) as physical ground station observations.")
        safety_rules.append("CRITICAL: Do NOT invent numerical concentrations, wind speeds, or NAQI values not present in the evidence context.")

        # Environmental rule evaluations based on personal exposure triggers
        if pm25_val is not None and pm25_val >= 60.0:
            # Elevated particulate scenario
            eligible_ids.add("ACT-VENT-SEAL-TEMPORARY")
            eligible_ids.add("ACT-VENT-NATURAL-CROSS")
            eligible_ids.add("ACT-VENT-PURIFY-HEPA")
            eligible_ids.add("ACT-INDOOR-SOURCE-CONTROL")
            eligible_ids.add("ACT-PROTECT-N95-STREET")
            eligible_ids.add("ACT-EXERCISE-INDOOR-CARDIO")
            eligible_ids.add("ACT-EXERCISE-RESCHEDULE")
            eligible_ids.add("ACT-COMMUTE-REDUCE-EXPOSURE")
            eligible_ids.add("ACT-COMMUTE-SEPARATION")
            safety_rules.append("Particulate levels indicate elevated instantaneous exposure (>=60 µg/m³): prioritize N95 respirators for street exposure and HEPA air cleaning.")
        elif pm25_val is not None and pm25_val < 30.0 and not is_stagnant:
            # Low particulate & favorable dispersion scenario
            eligible_ids.add("ACT-VENT-NATURAL-CROSS")
            eligible_ids.add("ACT-VENT-MONITOR-BASELINE")
            eligible_ids.add("ACT-EXERCISE-MODERATE-OUTDOOR")
            eligible_ids.add("ACT-INDOOR-SOURCE-CONTROL")
            eligible_ids.add("ACT-COMMUTE-SEPARATION")
            safety_rules.append("Particulate levels are moderate/low: natural ventilation is acceptable; encourage standard source control.")
        else:
            # Moderate scenario
            eligible_ids.add("ACT-VENT-SEAL-TEMPORARY")
            eligible_ids.add("ACT-VENT-NATURAL-CROSS")
            eligible_ids.add("ACT-VENT-PURIFY-HEPA")
            eligible_ids.add("ACT-INDOOR-SOURCE-CONTROL")
            eligible_ids.add("ACT-EXERCISE-RESCHEDULE")
            eligible_ids.add("ACT-EXERCISE-MODERATE-OUTDOOR")
            eligible_ids.add("ACT-COMMUTE-SEPARATION")
            if pm25_val is not None and pm25_val >= 40.0:
                eligible_ids.add("ACT-PROTECT-N95-STREET")
                eligible_ids.add("ACT-EXERCISE-INDOOR-CARDIO")
                eligible_ids.add("ACT-COMMUTE-REDUCE-EXPOSURE")

        # Tailor according to ActivityContext focus if provided
        if activity_context == ActivityContext.OUTDOOR_EXERCISE:
            safety_rules.append("User focus: Outdoor Exercise. Emphasize breathing rate dynamics and time-of-day shifting.")
        elif activity_context == ActivityContext.VENTILATION:
            safety_rules.append("User focus: Indoor Ventilation. Emphasize HEPA circulation and brief cross-ventilation.")
        elif activity_context == ActivityContext.COMMUTE:
            safety_rules.append("User focus: Commuting. Emphasize cabin air recirculation, vehicle separation, and street protection.")
        elif activity_context == ActivityContext.SENSITIVE_POPULATION:
            safety_rules.append("User focus: Sensitive Population. Adopt conservative thresholds for respiratory protection and indoor staying.")

        # Ensure all actions have ALL required evidence keys present AND fresh
        verified_eligible_ids: Set[str] = set()
        for aid in eligible_ids:
            canonical = CANONICAL_ACTIONS[aid]
            has_valid_evidence = True
            for k in canonical.required_evidence_keys:
                if (k.startswith("EVID-WEATHER") or k == "EVID-DISPERSION") and not evidence.weather_usable:
                    has_valid_evidence = False
                    break
                item = evidence.evidence_items.get(k)
                if not item or item.freshness in (FreshnessStatus.STALE, FreshnessStatus.INVALID, FreshnessStatus.UNAVAILABLE):
                    has_valid_evidence = False
                    break
            if has_valid_evidence:
                verified_eligible_ids.add(aid)

        if not verified_eligible_ids:
            verified_eligible_ids.add("ACT-INDOOR-SOURCE-CONTROL")

        return verified_eligible_ids, safety_rules

    @staticmethod
    def generate_deterministic_fallback(
        evidence: EnvironmentalEvidenceContext,
        activity_context: ActivityContext,
        eligible_action_ids: Set[str],
        reason: str,
        telemetry_usable: bool = True
    ) -> List[AIInsightAction]:
        """Generate safe, deterministic action recommendations without calling generative AI."""
        candidates = [
            CANONICAL_ACTIONS[aid]
            for aid in eligible_action_ids
            if aid in CANONICAL_ACTIONS
        ]
        candidates.sort(key=lambda a: a.fallback_priority)

        selected = candidates[:3]
        fallback_actions: List[AIInsightAction] = []

        for c in selected:
            if not telemetry_usable or not c.required_evidence_keys:
                # Telemetry unverified or baseline action: no evidence IDs cited
                evids = []
            else:
                # Collect matching evidence IDs that are valid and non-stale
                evids = [
                    k for k in c.required_evidence_keys
                    if k in evidence.evidence_items
                    and evidence.evidence_items[k].freshness in (FreshnessStatus.FRESH, FreshnessStatus.RECENT)
                    and not ((k.startswith("EVID-WEATHER") or k == "EVID-DISPERSION") and not evidence.weather_usable)
                ]

            fallback_actions.append(
                AIInsightAction(
                    action_id=c.action_id,
                    category=c.category,
                    priority=c.priority,
                    title=c.title,
                    rationale=c.rationale,
                    evidence_ids=evids
                )
            )

        return fallback_actions

    @staticmethod
    def check_prohibited_and_unsafe_claims(full_text: str) -> Tuple[bool, Optional[str]]:
        """Check all text fields for prohibited phrases, medical claims, unsupported certainty, and fallacies."""
        lower_text = full_text.lower()

        # 1. Prohibited phrases check with negation awareness
        for phrase in PROHIBITED_PHRASES:
            if phrase in lower_text:
                # Check if the phrase is clearly negated (e.g. "without generating ozone", "avoid ozone generators", "never use an ozone air purifier")
                negation_pattern = rf"(?:without(?:\s+generating|\s+producing)?|do\s+not\s+(?:use|recommend)|never\s+(?:use|recommend)|avoid(?:\s+using)?|against|not\s+a)\s+(?:an?\s+)?{re.escape(phrase)}"
                matches = list(re.finditer(re.escape(phrase), lower_text))
                all_negated = True
                for m in matches:
                    start_idx = max(0, m.start() - 60)
                    preceding = lower_text[start_idx:m.end()]
                    if not re.search(negation_pattern, preceding):
                        all_negated = False
                        break
                if not all_negated:
                    return False, f"Prohibited phrase or claim detected in AI response: '{phrase}'."

        # 2. Misleading action rationale claims
        for pat in MISLEADING_RATIONALE_PATTERNS:
            if re.search(pat, lower_text):
                return False, f"Misleading environmental or respiratory protection claim detected in AI response."

        # 3. Unsupported certainty or absolute safety in polluted outdoor air
        certainty_patterns = [
            r"\b100%\s*safe\b",
            r"\bguaranteed\s+(?:protection|clean|safety)\b",
            r"\bzero\s+risk\b",
            r"\bcompletely\s+safe\s+outdoors\b",
            r"\bno\s+health\s+risk\b",
            r"\btotally\s+safe\b"
        ]
        for pat in certainty_patterns:
            if re.search(pat, lower_text):
                return False, "Unsupported absolute certainty or safety claim detected in AI text."

        return True, None

    @staticmethod
    def validate_evidence_item_for_claim(
        evidence: EnvironmentalEvidenceContext,
        evid_key: str,
        pol_code: str,
        claimed_val: Optional[float] = None,
        claimed_unit: Optional[str] = None,
        is_statutory_claim: bool = False,
        is_physical_claim: bool = False,
        reference_time: Optional[datetime] = None
    ) -> Tuple[bool, Optional[str]]:
        """Strictly validate the actual evidence item supporting an environmental claim.

        Enforces evidence existence, strict freshness allowlist, timestamp provenance,
        complete dimensional unit compatibility, source classification, and regulatory
        averaging period benchmarks.
        """
        # 1. Existence check
        if evid_key not in evidence.evidence_items:
            return False, f"Model claimed {pol_code} concentration, but evidence item '{evid_key}' is missing from verified telemetry."

        item = evidence.evidence_items[evid_key]
        cfg = SUPPORTED_POLLUTANTS_CONFIG[pol_code]

        # 2. Freshness and usability of evidence item (Strict Fail-Closed Allowlist)
        if item.freshness is None:
            return False, f"Evidence item '{evid_key}' for {pol_code} has missing freshness status; unverified evidence cannot validate numerical concentration claims."

        if item.freshness not in ALLOWED_CLAIM_FRESHNESS:
            status_desc = getattr(item.freshness, "value", str(item.freshness))
            return False, f"Evidence item '{evid_key}' for {pol_code} has unusable freshness status '{status_desc}'; stale or invalid evidence cannot validate numerical concentration claims."

        # 3. Evidence unit presence, completeness, and dimensional validity
        if item.unit is None or not item.unit.strip():
            return False, f"Evidence item '{evid_key}' has missing unit metadata; cannot validate numerical claim for {pol_code}."

        valid_units_pattern = r"^\s*(?:" + "|".join(cfg["valid_units"]) + r")\s*$"
        if not re.match(valid_units_pattern, item.unit, re.IGNORECASE):
            return False, f"Evidence item '{evid_key}' has incompatible recorded unit '{item.unit}'; expected complete dimensional unit like {cfg['default_unit']} for {pol_code}."

        if claimed_unit is not None:
            if not claimed_unit.strip() or not re.match(valid_units_pattern, claimed_unit, re.IGNORECASE):
                return False, f"Claimed unit '{claimed_unit}' for {pol_code} is invalid; expected complete dimensional unit like {cfg['default_unit']}."

            def canonical_dimension(u: str) -> Optional[str]:
                u_norm = u.lower().replace(" ", "")
                if re.match(r"^[µμu]g/m[3³]$", u_norm) or "microgram" in u_norm:
                    return "µg/m³"
                if re.match(r"^mg/m[3³]$", u_norm) or "milligram" in u_norm:
                    return "mg/m³"
                return None

            evid_dim = canonical_dimension(item.unit)
            claim_dim = canonical_dimension(claimed_unit)
            if evid_dim is not None and claim_dim is not None and evid_dim != claim_dim:
                return False, f"Model claimed unit '{claimed_unit}' ({claim_dim}) differs from evidence telemetry unit '{item.unit}' ({evid_dim}) for {pol_code}; unverified unit conversions are rejected."

        # 4. Timestamp provenance of evidence item
        if item.timestamp is None:
            return False, f"Evidence item '{evid_key}' has missing timestamp provenance; cannot validate numerical claim for {pol_code}."

        if not isinstance(item.timestamp, datetime):
            return False, f"Evidence item '{evid_key}' timestamp is malformed."

        if item.timestamp.tzinfo is None or item.timestamp.tzinfo.utcoffset(item.timestamp) is None:
            return False, f"Evidence item '{evid_key}' timestamp is naive; must be timezone-aware."

        now_utc = reference_time if reference_time is not None else datetime.now(timezone.utc)
        if now_utc.tzinfo is None:
            now_utc = now_utc.replace(tzinfo=timezone.utc)
        else:
            now_utc = now_utc.astimezone(timezone.utc)

        ts_dt = item.timestamp.astimezone(timezone.utc)

        if item.classification == DataClassification.OBSERVATION:
            if ts_dt > now_utc + timedelta(minutes=5):
                return False, f"Evidence item '{evid_key}' observation timestamp is future-dated beyond clock-skew tolerance."
            if (now_utc - ts_dt).total_seconds() > 180 * 60:
                return False, f"Evidence item '{evid_key}' observation is expired/stale (>180 minutes old)."
        elif item.classification == DataClassification.MODELLED_FORECAST:
            delta_fc = (ts_dt - now_utc).total_seconds()
            if delta_fc < -MAX_FORECAST_PAST_SECONDS:
                return False, f"Evidence item '{evid_key}' forecast timestamp is expired (>60 minutes in past)."
            if delta_fc > MAX_FORECAST_FUTURE_SECONDS:
                return False, f"Evidence item '{evid_key}' forecast timestamp ({delta_fc / 3600:.1f}h in future) exceeds maximum permitted forecast horizon ({MAX_FORECAST_FUTURE_HOURS} hours)."

        # 5. Finite numeric value verification
        try:
            actual_val = float(item.value)
        except (ValueError, TypeError):
            return False, f"Evidence item '{evid_key}' contains non-numeric value '{item.value}'."

        if not math.isfinite(actual_val):
            return False, f"Evidence item '{evid_key}' contains non-finite value '{item.value}'."

        # 6. Numeric match check
        if claimed_val is not None:
            if claimed_val < 0 or (claimed_val == 0.0 and math.copysign(1.0, claimed_val) < 0.0):
                return False, f"Claimed {pol_code} concentration {claimed_val} is negative; pollutant concentrations must be non-negative physical values."
            if abs(claimed_val - actual_val) > cfg["tolerance"]:
                return False, f"Model claimed {pol_code} concentration of {claimed_val} {item.unit}, which conflicts with verified telemetry ({actual_val} {item.unit})."

        # 7. Physical observation claim verification
        if is_physical_claim:
            if item.classification != DataClassification.OBSERVATION:
                return False, f"Model represented {pol_code} as a physical observation, but evidence source is {item.classification.value}."

        # 8. Statutory NAAQS averaging period verification
        if is_statutory_claim:
            if item.classification != DataClassification.OBSERVATION:
                return False, f"Model improperly claimed {pol_code} concentration constitutes an official statutory {cfg['standard_period']} NAAQS regulatory exceedance on modelled data."
            if item.averaging_period != cfg["standard_period"]:
                return False, f"Model claimed {pol_code} concentration constitutes an official statutory {cfg['standard_period']} NAAQS regulatory exceedance, but evidence averaging period is '{item.averaging_period or 'unverified'}'."

        return True, None

    @staticmethod
    def check_numerical_and_scientific_claims(
        full_text: str,
        evidence: Optional[EnvironmentalEvidenceContext],
        reference_time: Optional[datetime] = None
    ) -> Tuple[bool, Optional[str]]:
        """Verify that prose does not invent or alter numerical telemetry or misrepresent source classification."""
        if evidence is None:
            return True, None

        lower_text = full_text.lower()

        # 1. Modelled vs Physical Observation claims
        if evidence.source_type == DataClassification.MODELLED_FORECAST:
            physical_claim_patterns = [
                r"\bphysical\s+(?:ground\s+)?(?:sensor|monitor|observation)\b",
                r"\bground\s+station\s+(?:recorded|measured|sensor)\b",
                r"\bstation\s+observation\b",
                r"\bmeasured\s+at\s+the\s+ground\s+station\b",
                r"\bmonitored\s+at\s+ground\s+level\s+station\b",
                r"\bphysical\s+measurement\s+station\b"
            ]
            for pat in physical_claim_patterns:
                if re.search(pat, lower_text):
                    return False, "Model improperly represented regional numerical model data as a physical ground station observation."

        # 2. General NAAQS compliance claims on hourly/modelled data
        if evidence.source_type == DataClassification.MODELLED_FORECAST:
            naaqs_24hr_patterns = [
                r"\bviolat(?:es?|ing)\s+(?:the\s+)?(?:\d+-?hour\s+)?naaqs\b",
                r"\bexceed(?:s|ing)\s+(?:the\s+)?(?:\d+-?hour\s+)?naaqs\b",
                r"\b(?:\d+-?hour\s+)?naaqs\s+(?:standard\s+)?(?:exceedance|violation)\b",
                r"\bexceeds\s+the\s+official\s+(?:\d+-?hour\s+)?limit\b",
                r"\bviolates\s+cpcb\b"
            ]
            for pat in naaqs_24hr_patterns:
                if re.search(pat, lower_text):
                    return False, "Model improperly claimed an instantaneous or modelled concentration constitutes an official 24-hour NAAQS regulatory exceedance."

        # 3. Invented or contradictory AQI / NAQI values
        aqi_matches = re.findall(
            r"\b(?:naqi|aqi)\b[^\n\.\,;]*?(\d+)\b",
            lower_text
        ) + re.findall(
            r"\b(\d+)\b[^\n\.\,;]*?\b(?:naqi|aqi)\b",
            lower_text
        )
        if aqi_matches:
            for val_str in aqi_matches:
                claimed_aqi = int(val_str)
                if evidence.indian_naqi is None:
                    return False, f"Model claimed numerical AQI/NAQI value '{claimed_aqi}', but official Indian NAQI is unavailable for this telemetry."
                elif claimed_aqi != evidence.indian_naqi:
                    return False, f"Model claimed numerical NAQI '{claimed_aqi}', which contradicts verified telemetry NAQI '{evidence.indian_naqi}'."

        # 4. Rigorous Sentence & Clause-level Multi-Pollutant Claim Extraction & Evidence Grounding
        sentences = [s.strip() for s in re.split(r"(?<=[.!?;\n])\s+", full_text) if s.strip()]
        last_pollutants: List[str] = []

        for sent in sentences:
            clauses = [c.strip() for c in re.split(r"[,;]|\b(?:and|while|whereas)\b", sent) if c.strip()]
            for c in clauses:
                c_lower = c.lower()
                current_pollutants: List[str] = []

                for pol_code, cfg in SUPPORTED_POLLUTANTS_CONFIG.items():
                    alias_pat = r"\b(?:" + "|".join(cfg["aliases"]) + r")\b"
                    if re.search(alias_pat, c_lower):
                        current_pollutants.append(pol_code)

                # Anaphora check if clause has no pollutant mentioned but refers to measurements
                if not current_pollutants and last_pollutants:
                    anaphora_pat = r"\b(?:the\s+)?(?:concentration|reading|level|value|measurement|it\s+measured|it\s+was|measured|recorded)\b"
                    if re.search(anaphora_pat, c_lower):
                        current_pollutants = list(last_pollutants)

                if current_pollutants:
                    last_pollutants = current_pollutants

                for pol_code in current_pollutants:
                    cfg = SUPPORTED_POLLUTANTS_CONFIG[pol_code]

                    # Check statutory / regulatory claims
                    is_statutory = bool(
                        re.search(r"(?:naaqs|cpcb|regulatory|statutory|standard|official\s+limit|limit)\b[^\n\.\,;]*?(?:exceed|violat|breach)", c_lower)
                        or re.search(r"(?:exceed|violat|breach)[^\n\.\,;]*?(?:naaqs|cpcb|regulatory|statutory|standard|official\s+limit|limit)", c_lower)
                        or re.search(r"\b(?:\d+-?hour\s+)?(?:limit|standard)\s+(?:has\s+been\s+)?(?:exceeded|violated)\b", c_lower)
                    )
                    if is_statutory:
                        ok_evid, evid_err = DeterministicSafetyEngine.validate_evidence_item_for_claim(
                            evidence=evidence,
                            evid_key=cfg["evid_key"],
                            pol_code=pol_code,
                            is_statutory_claim=True,
                            reference_time=reference_time
                        )
                        if not ok_evid:
                            return False, evid_err

                    # Mask non-concentration numbers using space replacement to preserve offsets
                    masked = c
                    def mask_space(m: re.Match) -> str:
                        return " " * len(m.group(0))

                    # Mask action IDs
                    masked = re.sub(r"\bACT-[A-Z0-9\-]+\b", mask_space, masked, flags=re.IGNORECASE)
                    # Mask respirators (N95, FFP2, N99)
                    masked = re.sub(r"\b[nN]\d{2,3}\b|\b[fF][fF][pP]\d\b", mask_space, masked)
                    # Mask all pollutant names and aliases
                    for other_code, other_cfg in SUPPORTED_POLLUTANTS_CONFIG.items():
                        oa_pat = r"\b(?:" + "|".join(other_cfg["aliases"]) + r")\b"
                        masked = re.sub(oa_pat, mask_space, masked, flags=re.IGNORECASE)
                    # Mask durations
                    masked = re.sub(r"\b\d+(?:-\d+)?\s*(?:minutes?|mins?|hours?|hrs?|days?|seconds?|sec)\b", mask_space, masked, flags=re.IGNORECASE)
                    masked = re.sub(r"\b\d+-hour\b|\b\d+-hr\b|\b\d+-minute\b|\b\d+-min\b", mask_space, masked, flags=re.IGNORECASE)
                    # Mask calendar dates (e.g. 2026-11-18, 2026/11/18)
                    masked = re.sub(r"\b\d{4}[-/]\d{2}[-/]\d{2}\b", mask_space, masked)
                    # Mask clock times
                    masked = re.sub(r"\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b", mask_space, masked, flags=re.IGNORECASE)
                    # Mask percentages and multipliers
                    masked = re.sub(r"\b\d+(?:-\d+)?x\b", mask_space, masked, flags=re.IGNORECASE)
                    masked = re.sub(r"\b\d+(?:\.\d+)?%", mask_space, masked)
                    # Mask distances and grid resolutions
                    masked = re.sub(r"\b\d+(?:\.\d+)?\s*(?:km|kilometers?)\b", mask_space, masked, flags=re.IGNORECASE)
                    masked = re.sub(r"\b\d+\s*m\s+(?:surface|wind|height|mixing|ceiling|grid)\b", mask_space, masked, flags=re.IGNORECASE)
                    # Mask temperatures
                    masked = re.sub(r"(?<!\w)[-\u2212]?\d+(?:\.\d+)?\s*(?:°c|celsius|degrees?(?:\s+celsius)?)\b", mask_space, masked, flags=re.IGNORECASE)
                    # Mask wind speeds (audited in meteorological section)
                    masked = re.sub(r"\b\d+(?:\.\d+)?\s*km/h\b", mask_space, masked, flags=re.IGNORECASE)
                    # Mask boundary layer height
                    masked = re.sub(r"\b\d+\s*m\b[^\n\.\,]*?(?:boundary|mixing|ceiling)", mask_space, masked, flags=re.IGNORECASE)
                    masked = re.sub(r"(?:boundary\s+layer|mixing\s+ceiling)[^\n\.\,]*?\b\d+\s*m\b", mask_space, masked, flags=re.IGNORECASE)

                    # Find candidate numbers in masked clause preserving sign
                    cand_matches = list(re.finditer(r"(?<![a-zA-Z0-9_\-\u2212])([-+\u2212]?\d+(?:\.\d+)?(?:[eE][-+\u2212]?\d+)?)\b", masked))
                    for m in cand_matches:
                        num_str = m.group(1)
                        num_str_clean = num_str.replace("\u2212", "-")
                        is_neg = (
                            num_str.strip().startswith(("-", "\u2212"))
                            or num_str_clean.strip().startswith("-")
                        )
                        start, end = m.start(), m.end()
                        sub_after = c[end:]
                        sub_before = c[:start]

                        incompat_pat = r"^\s*(?:" + "|".join(cfg["incompatible_units"]) + r")"
                        valid_pat = r"^\s*(?:" + "|".join(cfg["valid_units"]) + r")"

                        m_inc = re.match(incompat_pat, sub_after, re.IGNORECASE)
                        m_val = re.match(valid_pat, sub_after, re.IGNORECASE)

                        if m_inc:
                            return False, f"Model used invalid unit for {pol_code}; expected {cfg['default_unit']}."

                        if m_val:
                            unit_end = m_val.end()
                            rem = sub_after[unit_end:]
                            # Enforce complete unit-token boundaries: reject attached Unicode/ASCII alphanumeric suffixes or appended dimensions
                            is_malformed_token = False
                            if rem:
                                first_c = rem[0]
                                cat = unicodedata.category(first_c)
                                if first_c.isalnum() or cat.startswith(("L", "N")) or first_c in ("_", "/", "-", "\u2013", "\u2014", "\u2212"):
                                    is_malformed_token = True
                                elif re.match(r"^\s*(?:/|\bper\s+(?:day|hour|hr|minute|min|sec|second|annum|year))\b", rem, re.IGNORECASE):
                                    is_malformed_token = True
                                elif re.match(r"^\s*/\s*(?:day|hour|hr|min|minute|sec|second|annum|year|m|m3|m³)", rem, re.IGNORECASE):
                                    is_malformed_token = True

                            if is_malformed_token:
                                return False, f"Model used invalid or malformed unit token for {pol_code}; expected complete recognized unit like {cfg['default_unit']}."

                            claimed_unit = m_val.group(0).strip()
                            try:
                                claimed_val = float(num_str_clean)
                            except ValueError:
                                return False, f"Model claimed non-numeric value '{num_str}' for {pol_code}."

                            if claimed_val < 0 or (claimed_val == 0.0 and math.copysign(1.0, claimed_val) < 0.0) or is_neg:
                                return False, f"Model claimed negative {pol_code} concentration of {claimed_val} {claimed_unit}; pollutant concentrations must be non-negative physical values."

                            ok_evid, evid_err = DeterministicSafetyEngine.validate_evidence_item_for_claim(
                                evidence=evidence,
                                evid_key=cfg["evid_key"],
                                pol_code=pol_code,
                                claimed_val=claimed_val,
                                claimed_unit=claimed_unit,
                                reference_time=reference_time
                            )
                            if not ok_evid:
                                return False, evid_err
                        else:
                            # Check if invalid unit preceded number (e.g. "85 ppm of PM2.5", "85 µg of PM2.5")
                            m_inc_before = re.search(r"(?:" + "|".join(cfg["incompatible_units"]) + r")\s*$", sub_before, re.IGNORECASE)
                            if m_inc_before:
                                return False, f"Model used invalid unit for {pol_code}; expected {cfg['default_unit']}."

                            # Check if valid unit preceded number
                            m_val_before = re.search(r"((?:" + "|".join(cfg["valid_units"]) + r"))([^\s]*)\s*$", sub_before, re.IGNORECASE)
                            if m_val_before:
                                before_start = m_val_before.start()
                                pre_unit = sub_before[:before_start]
                                post_unit = m_val_before.group(2)

                                is_malformed_token = False
                                # Check if malformed suffix attached directly to unit before number (e.g. "µg/m³β 85")
                                if post_unit:
                                    first_c = post_unit[0]
                                    cat = unicodedata.category(first_c)
                                    if first_c.isalnum() or cat.startswith(("L", "N")) or first_c in ("_", "/", "-", "\u2013", "\u2014", "\u2212"):
                                        is_malformed_token = True

                                # Check if malformed prefix attached directly to unit before number (e.g. "βµg/m³ 85")
                                if pre_unit:
                                    last_c = pre_unit[-1]
                                    cat = unicodedata.category(last_c)
                                    if last_c.isalnum() or cat.startswith(("L", "N")) or last_c in ("_", "/", "-", "\u2013", "\u2014", "\u2212"):
                                        is_malformed_token = True

                                if is_malformed_token:
                                    return False, f"Model used invalid or malformed unit token for {pol_code}; expected complete recognized unit like {cfg['default_unit']}."

                                claimed_unit = m_val_before.group(1).strip()
                                try:
                                    claimed_val = float(num_str_clean)
                                except ValueError:
                                    return False, f"Model claimed non-numeric value '{num_str}' for {pol_code}."

                                if claimed_val < 0 or (claimed_val == 0.0 and math.copysign(1.0, claimed_val) < 0.0) or is_neg:
                                    return False, f"Model claimed negative {pol_code} concentration of {claimed_val} {claimed_unit}; pollutant concentrations must be non-negative physical values."

                                ok_evid, evid_err = DeterministicSafetyEngine.validate_evidence_item_for_claim(
                                    evidence=evidence,
                                    evid_key=cfg["evid_key"],
                                    pol_code=pol_code,
                                    claimed_val=claimed_val,
                                    claimed_unit=claimed_unit,
                                    reference_time=reference_time
                                )
                                if not ok_evid:
                                    return False, evid_err
                            else:
                                # Bare number without physical unit
                                return False, f"Model claimed {pol_code} concentration of {num_str} without explicit physical unit; environmental metrics must explicitly specify {cfg['default_unit']}."

        # 5. Wind speed numerical validation
        wind_matches = re.findall(r"(\d+(?:\.\d+)?)\s*km/h\b", lower_text)
        if wind_matches:
            if not evidence.weather_usable or "EVID-WEATHER-WIND" not in evidence.evidence_items:
                return False, f"Model claimed wind speed of {wind_matches[0]} km/h, but weather telemetry is unavailable or unverified."
            try:
                actual_wind = float(evidence.evidence_items["EVID-WEATHER-WIND"].value)
                for claimed_str in wind_matches:
                    claimed_wind = float(claimed_str)
                    if abs(claimed_wind - actual_wind) > 2.0:
                        return False, f"Model claimed wind speed of {claimed_wind} km/h, which conflicts with telemetry ({actual_wind} km/h)."
            except ValueError:
                pass

        # Bare wind speed without unit: e.g. "wind speed was 15"
        bare_wind = re.findall(r"\bwind\s+(?:speed\s+)?(?:was|is|at|of|reached|:)\s*(\d+(?:\.\d+)?)\b(?!\s*km/h)", lower_text)
        if bare_wind:
            return False, f"Model claimed wind speed of {bare_wind[0]} without explicit unit; weather metrics must explicitly specify km/h."

        # 6. Boundary layer height numerical validation
        blh_matches = re.findall(r"(\d+)\s*m\b[^\n\.\,]*?(?:boundary|mixing|ceiling)", lower_text) + \
                      re.findall(r"(?:boundary\s+layer|mixing\s+ceiling)[^\n\.\,]*?(\d+)\s*m\b", lower_text)
        if blh_matches:
            if not evidence.weather_usable or "EVID-WEATHER-BLH" not in evidence.evidence_items:
                return False, f"Model claimed boundary layer height of {blh_matches[0]}m, but weather telemetry is unavailable or unverified."
            try:
                actual_blh = float(evidence.evidence_items["EVID-WEATHER-BLH"].value)
                for claimed_str in blh_matches:
                    claimed_blh = float(claimed_str)
                    if abs(claimed_blh - actual_blh) > 25.0:
                        return False, f"Model claimed boundary layer height of {claimed_blh}m, which conflicts with telemetry ({actual_blh}m)."
            except ValueError:
                pass

        return True, None

    @staticmethod
    def validate_synthesized_response(
        recommended_actions: List[AIInsightAction],
        eligible_action_ids: Set[str],
        valid_evidence_items: Optional[Dict[str, EnvironmentalEvidenceItem]] = None,
        summary: str = "",
        explanation: str = "",
        supporting_factors: Optional[List[str]] = None,
        uncertainty_and_limitations: str = "",
        evidence_context: Optional[EnvironmentalEvidenceContext] = None,
        valid_evidence_ids: Optional[Set[str]] = None
    ) -> Tuple[bool, Optional[str]]:
        """Validate Gemini structured output against deterministic constraints and allowlists.

        Returns (is_valid, failure_reason).
        """
        # Resolve valid evidence keys
        if valid_evidence_items is not None:
            valid_keys = set(valid_evidence_items.keys())
        elif valid_evidence_ids is not None:
            valid_keys = set(valid_evidence_ids)
        else:
            valid_keys = set()

        factors = supporting_factors or []

        # 1. Aggregate all text fields for safety and numerical auditing
        all_text_blocks = [summary, explanation, uncertainty_and_limitations] + factors
        for action in recommended_actions:
            all_text_blocks.append(action.title)
            all_text_blocks.append(action.rationale)

        full_text = " ".join(all_text_blocks)

        # 2. Check Prohibited Phrases & Unsupported Certainty across all text fields
        ok_prohibited, prohibited_err = DeterministicSafetyEngine.check_prohibited_and_unsafe_claims(full_text)
        if not ok_prohibited:
            return False, prohibited_err

        # 3. Check Numerical and Scientific Claim Integrity
        ok_claims, claims_err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(full_text, evidence_context)
        if not ok_claims:
            return False, claims_err

        # 4. Validate recommended actions
        if not recommended_actions:
            return False, "AI response contained an empty list of recommended actions."

        for action in recommended_actions:
            # Check action ID against allowlist
            if action.action_id not in eligible_action_ids:
                return False, f"Unauthorized or unknown action ID '{action.action_id}' returned by AI."

            canonical = CANONICAL_ACTIONS.get(action.action_id)
            if not canonical:
                return False, f"Action ID '{action.action_id}' is not in canonical catalog."

            # Category tampering check
            if action.category != canonical.category:
                return False, f"Action category '{action.category}' does not match canonical '{canonical.category}' for '{action.action_id}'."

            # Title tampering check: if model supplied a non-empty title, it must match canonical
            if action.title and action.title.strip() != canonical.title.strip():
                return False, f"Model modified canonical action title for '{action.action_id}': '{action.title}'."

            # Rationale check: verify no misleading/unsafe rationale was attached
            if action.rationale:
                ok_rat, rat_err = DeterministicSafetyEngine.check_prohibited_and_unsafe_claims(action.rationale)
                if not ok_rat:
                    return False, f"Unsafe instruction in action rationale for '{action.action_id}': {rat_err}"
                for pat in MISLEADING_RATIONALE_PATTERNS:
                    if re.search(pat, action.rationale.lower()):
                        return False, f"Model attached misleading rationale to '{action.action_id}': '{action.rationale}'."

            # Evidence citation & relevance validation
            if canonical.required_evidence_keys:
                if not action.evidence_ids:
                    return False, f"Action '{action.action_id}' is telemetry-dependent and requires evidence, but evidence_ids was empty."
                for req_k in canonical.required_evidence_keys:
                    if req_k not in action.evidence_ids:
                        return False, f"Action '{action.action_id}' requires mandatory evidence '{req_k}', but it was not cited."

            # Validate all cited evidence IDs
            for eid in action.evidence_ids:
                if eid not in valid_keys:
                    return False, f"Action '{action.action_id}' references unknown, stale, or invalid evidence ID '{eid}'."
                if eid not in canonical.allowed_evidence_keys:
                    return False, f"Action '{action.action_id}' cited irrelevant evidence ID '{eid}'."

        return True, None
