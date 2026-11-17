"""Central Pollution Control Board (CPCB) Architecture & Integrity Specifications.

Official Indian NAQI Standards & Investigation Findings:
1. Authority: Central Pollution Control Board (Ministry of Environment, Forest and Climate Change, Govt of India)
   is the sole statutory authority for official Indian National Air Quality Index (NAQI).
2. API Access Investigation & Integrity Status:
   - Official CAAQMS (Continuous Ambient Air Quality Monitoring Stations) real-time data
     is published periodically via the Open Government Data (OGD) Platform (data.gov.in).
   - Automated programmatic access requires an authorized data.gov.in API key and registered
     catalog resource ID under the National Data Sharing and Accessibility Policy (NDSAP).
   - No public, unauthenticated, rate-limit-free REST endpoint exists for instant CPCB queries.
   - In accordance with competition rules, BreatheWise AI DOES NOT scrape private dashboards,
     DOES NOT reverse-engineer undocumented endpoints, and DOES NOT invent mock feeds claiming to be CPCB.
3. Statutory Indian NAQI Calculation Methodology (CPCB Technical Guidelines):
   - Criteria Pollutants: PM2.5, PM10, NO2, SO2, CO, O3, NH3, Pb.
   - Pollutant-Specific Averaging Requirements:
     * 24-Hour Averaging: PM2.5, PM10, NO2, SO2, NH3, Pb.
       Requires at least 16 hours of valid data (66.7% data capture) in the 24-hour period.
     * 8-Hour Averaging: CO and O3 (maximum 8-hour rolling average in a 24-hour cycle).
       Requires at least 6 hours of valid data (75% data capture) within the 8-hour window,
       evaluated over a minimum 16-hour monitoring duration.
   - Minimum Pollutant Requirements for Overall NAQI:
     * At least THREE criteria pollutants must be monitored and have valid sub-indices.
     * At least ONE of the pollutants MUST be PM2.5 or PM10 (particulate matter).
   - Overall NAQI Value:
     * Determined by the maximum of valid sub-indices: NAQI = max(I_p).
     * The pollutant with the maximum sub-index is designated the dominant pollutant.
"""
import math
from dataclasses import dataclass
from typing import Optional, Dict, List, Tuple, Union, Any
from datetime import datetime, timezone

from ..schemas.common import (
    DataClassification,
    FreshnessStatus,
    QualityStatus,
    LocationMetadata
)
from ..schemas.air_quality import (
    NormalizedAirQualityResponse,
    AirQualityForecastResponse
)
from .base import BaseAirQualityProvider


# Official CPCB Breakpoints for Indian NAQI (8 Pollutants)
# Format: [B_Lo, B_Hi, I_Lo, I_Hi]
CPCB_BREAKPOINTS = {
    "PM2.5": [
        (0, 30, 0, 50),
        (30, 60, 51, 100),
        (60, 90, 101, 200),
        (90, 120, 201, 300),
        (120, 250, 301, 400),
        (250, 500, 401, 500)
    ],
    "PM10": [
        (0, 50, 0, 50),
        (50, 100, 51, 100),
        (100, 250, 101, 200),
        (250, 350, 201, 300),
        (350, 430, 301, 400),
        (430, 500, 401, 500)
    ],
    "NO2": [
        (0, 40, 0, 50),
        (40, 80, 51, 100),
        (80, 180, 101, 200),
        (180, 280, 201, 300),
        (280, 400, 301, 400),
        (400, 1000, 401, 500)
    ],
    "SO2": [
        (0, 40, 0, 50),
        (40, 80, 51, 100),
        (80, 380, 101, 200),
        (380, 800, 201, 300),
        (800, 1600, 301, 400),
        (1600, 2000, 401, 500)
    ],
    "CO": [  # in mg/m³
        (0, 1.0, 0, 50),
        (1.0, 2.0, 51, 100),
        (2.0, 10.0, 101, 200),
        (10.0, 17.0, 201, 300),
        (17.0, 34.0, 301, 400),
        (34.0, 50.0, 401, 500)
    ],
    "O3": [
        (0, 50, 0, 50),
        (50, 100, 51, 100),
        (100, 168, 101, 200),
        (168, 208, 201, 300),
        (208, 748, 301, 400),
        (748, 1000, 401, 500)
    ],
    "NH3": [
        (0, 200, 0, 50),
        (200, 400, 51, 100),
        (400, 800, 101, 200),
        (800, 1200, 201, 300),
        (1200, 1800, 301, 400),
        (1800, 2400, 401, 500)
    ],
    "Pb": [
        (0, 0.5, 0, 50),
        (0.5, 1.0, 51, 100),
        (1.0, 2.0, 101, 200),
        (2.0, 3.0, 201, 300),
        (3.0, 3.5, 301, 400),
        (3.5, 5.0, 401, 500)
    ]
}

# Statutory averaging specifications per pollutant
POLLUTANT_AVERAGING_SPECS = {
    "PM2.5": {"period_hours": 24, "min_valid_hours": 16, "min_diurnal_station_hours": 16, "unit": "µg/m³"},
    "PM10": {"period_hours": 24, "min_valid_hours": 16, "min_diurnal_station_hours": 16, "unit": "µg/m³"},
    "NO2": {"period_hours": 24, "min_valid_hours": 16, "min_diurnal_station_hours": 16, "unit": "µg/m³"},
    "SO2": {"period_hours": 24, "min_valid_hours": 16, "min_diurnal_station_hours": 16, "unit": "µg/m³"},
    "NH3": {"period_hours": 24, "min_valid_hours": 16, "min_diurnal_station_hours": 16, "unit": "µg/m³"},
    "Pb": {"period_hours": 24, "min_valid_hours": 16, "min_diurnal_station_hours": 16, "unit": "µg/m³"},
    "CO": {"period_hours": 8, "min_valid_hours": 6, "min_diurnal_station_hours": 16, "unit": "mg/m³"},
    "O3": {"period_hours": 8, "min_valid_hours": 6, "min_diurnal_station_hours": 16, "unit": "µg/m³"}
}


@dataclass
class ValidatedAveragedConcentration:
    """Validated time-averaged criteria pollutant concentration for CPCB NAQI calculation.

    Strictly separates validated time-averaged physical measurements from raw or modelled data.
    """
    pollutant: str
    concentration: float
    unit: str
    averaging_hours: int
    valid_monitored_hours: int
    data_classification: DataClassification = DataClassification.OBSERVATION
    is_physical_observation: bool = True


@dataclass
class EligibleSubIndex:
    """Verified pollutant sub-index satisfying all statutory CPCB data sufficiency criteria."""
    pollutant: str
    sub_index: int
    averaging_hours: int
    valid_monitored_hours: int
    provenance: str = "Verified physical CPCB monitoring criteria satisfied"


def check_cpcb_averaging_eligibility(
    pollutant: str,
    valid_monitored_hours: int,
    total_window_hours: int = 24
) -> Tuple[bool, str]:
    """Verify if a pollutant monitoring series meets official CPCB data sufficiency rules.

    AUTHORITATIVE BASIS (CPCB Technical Report CUPS/82/2014-15):
    - 24-Hour Pollutants (PM2.5, PM10, NO2, SO2, NH3, Pb):
      Statutory codified requirement: At least 16 hours of valid data within the 24-hour monitoring period
      (>= 66.7% data capture).
    - 8-Hour Pollutants (CO, O3):
      CPCB methodology specifies 8-hour rolling averages, which require at least 6 hourly measurements
      per 8-hour window (75% data capture within the window). In addition, CPCB station-level bulletin
      rules require a minimum of 16 hours of valid data over the 24-hour diurnal cycle to compute
      rolling 8-hour maximums.
    - FULL ROLLING-WINDOW LIMITATION:
      Independently verifying the 6-hour rolling average criterion requires a granular 1-hour time series
      of at least 6 distinct hourly readings per 8-hour block. An isolated scalar concentration cannot
      verify rolling-window sample completeness without raw CAAQMS time-series telemetry. Therefore,
      station-level eligibility verifies diurnal monitoring coverage (>= 16h), while acknowledging that
      full rolling-window validation requires live telemetry.

    Returns:
        (is_eligible, explanation)
    """
    if pollutant not in POLLUTANT_AVERAGING_SPECS:
        return False, f"Unknown pollutant code '{pollutant}' for CPCB NAQI."

    # Validate total_window_hours (must be integer, not bool, exactly 8 or 24)
    if isinstance(total_window_hours, bool) or not isinstance(total_window_hours, int):
        return False, f"Invalid total window hours: must be an integer, received {type(total_window_hours).__name__} ({total_window_hours})."

    if total_window_hours not in (8, 24):
        return False, f"Invalid total window hours: must be 8 or 24, received {total_window_hours}."

    # Validate valid_monitored_hours (must be integer, not bool, within [0, total_window_hours])
    if isinstance(valid_monitored_hours, bool) or not isinstance(valid_monitored_hours, int):
        return False, f"Invalid monitored hours: must be an integer, received {type(valid_monitored_hours).__name__} ({valid_monitored_hours})."

    if not (0 <= valid_monitored_hours <= total_window_hours):
        return False, f"Invalid monitored hours: must be within [0, {total_window_hours}], received {valid_monitored_hours}."

    spec = POLLUTANT_AVERAGING_SPECS[pollutant]
    period = spec["period_hours"]

    if period == 24:
        if valid_monitored_hours >= 16:
            return True, f"Eligible for 24-hour CPCB sub-index ({valid_monitored_hours}/24 valid hours; statutory minimum 16 required)."
        return False, f"Ineligible for 24-hour CPCB sub-index: requires at least 16 valid hours in 24-hour cycle; received {valid_monitored_hours}."
    elif period == 8:
        if total_window_hours == 8:
            if valid_monitored_hours >= 6:
                return True, f"Eligible for 8-hour rolling sub-index ({valid_monitored_hours}/8 hours satisfy the 75% window data capture requirement; full rolling verification requires 1-hour time series)."
            return False, f"Ineligible for 8-hour rolling sub-index: requires at least 6 valid hourly measurements in 8-hour window; received {valid_monitored_hours}."
        else:
            if valid_monitored_hours >= 16:
                return True, f"Eligible for 8-hour CPCB sub-index ({valid_monitored_hours} valid hours meet the statutory 16h diurnal monitoring requirement for 8-hour rolling maximums; full rolling verification requires 1-hour time series)."
            return False, f"Ineligible for 8-hour CPCB sub-index: requires at least 16 hours of diurnal station monitoring to determine rolling 8-hour maximums; received {valid_monitored_hours}."

    return False, "Unspecified averaging constraint."


def calculate_official_cpcb_subindex(pollutant: str, concentration: float) -> Optional[int]:
    """Calculate raw sub-index for a pollutant using CPCB piecewise linear formula:

    I_p = [ (I_Hi - I_Lo) / (B_Hi - B_Lo) ] * (C_p - B_Lo) + I_Lo

    NOTE: This is a non-authoritative computational utility implementing CPCB mathematical formulas.
    It does NOT certify official CPCB NAQI status. Official statutory Indian NAQI requires certified
    CAAQMS station telemetry from Central Pollution Control Board / State Pollution Control Boards.
    """
    if pollutant not in CPCB_BREAKPOINTS or concentration is None:
        return None

    try:
        c_f = float(concentration)
    except (TypeError, ValueError):
        return None

    if math.isnan(c_f) or math.isinf(c_f) or c_f < 0:
        return None

    breakpoints = CPCB_BREAKPOINTS[pollutant]
    for b_lo, b_hi, i_lo, i_hi in breakpoints:
        if b_lo <= c_f <= b_hi:
            sub = ((i_hi - i_lo) / (b_hi - b_lo)) * (c_f - b_lo) + i_lo
            return int(round(sub))

    # If concentration exceeds highest breakpoint, cap at 500
    if c_f > breakpoints[-1][1]:
        return 500
    return None


def validate_and_calculate_cpcb_subindex(
    input_data: ValidatedAveragedConcentration
) -> Tuple[Optional[EligibleSubIndex], str]:
    """Validate a pollutant's averaging, monitoring sufficiency, and unit, then calculate eligible sub-index.

    NOTE: This is a non-authoritative computational utility implementing CPCB mathematical formulas.
    It does NOT certify official CPCB NAQI status. Official statutory Indian NAQI requires certified
    CAAQMS station telemetry from Central Pollution Control Board / State Pollution Control Boards.

    Enforces:
    - Physical observation provenance (rejects modelled or simulated data).
    - Finite numerical concentration (rejects NaN, Inf, and negatives).
    - Exact accepted units (µg/m³, ug/m³, µg/m3, ug/m3; mg/m³, mg/m3 for CO with exact conversion).
    - Pollutant-specific averaging duration (24h or 8h).
    - Minimum valid data capture (>= 16 valid monitored hours).

    Returns:
        (EligibleSubIndex, explanation_message)
    """
    if input_data.pollutant not in POLLUTANT_AVERAGING_SPECS:
        return None, f"Unknown criteria pollutant code '{input_data.pollutant}'."

    # 1. Reject modelled forecasts or simulated data
    if input_data.data_classification != DataClassification.OBSERVATION or not input_data.is_physical_observation:
        return None, f"Ineligible for CPCB sub-index: Modelled forecast or simulated data ({input_data.data_classification.value}) cannot produce an official sub-index."

    spec = POLLUTANT_AVERAGING_SPECS[input_data.pollutant]

    # 2. Validate numerical concentration (finite, non-negative)
    if input_data.concentration is None:
        return None, "Concentration must not be None."

    try:
        conc = float(input_data.concentration)
    except (TypeError, ValueError):
        return None, "Concentration must be a valid numerical value."

    if math.isnan(conc) or math.isinf(conc):
        return None, f"Non-finite concentration ({conc}) cannot produce a valid sub-index."

    if conc < 0:
        return None, "Negative concentration cannot produce a valid sub-index."

    # 3. Validate exact accepted units (no substring matching that could match mg/L, mg/kg, µg/L)
    VALID_UG_M3_UNITS = {"µg/m³", "ug/m³", "µg/m3", "ug/m3"}
    VALID_MG_M3_UNITS = {"mg/m³", "mg/m3"}

    unit_str = input_data.unit.strip() if isinstance(input_data.unit, str) else ""

    if input_data.pollutant == "CO":
        if unit_str in VALID_MG_M3_UNITS:
            pass  # Already in statutory mg/m³
        elif unit_str in VALID_UG_M3_UNITS:
            # Documented explicit conversion from µg/m³ to mg/m³
            conc = conc / 1000.0
        else:
            return None, f"Invalid unit '{input_data.unit}' for CO. Statutory CPCB standard requires mg/m³ (or convertible µg/m³); rejected non-atmospheric unit."
    else:
        if unit_str not in VALID_UG_M3_UNITS:
            return None, f"Invalid unit '{input_data.unit}' for {input_data.pollutant}. Statutory CPCB standard requires µg/m³; rejected '{input_data.unit}'."

    # 4. Validate averaging period
    if isinstance(input_data.averaging_hours, bool) or not isinstance(input_data.averaging_hours, int) or input_data.averaging_hours != spec["period_hours"]:
        return None, f"Ineligible averaging period: {input_data.pollutant} requires {spec['period_hours']}-hour average; received {input_data.averaging_hours}."

    # 5. Validate minimum monitored data duration
    is_eligible, elig_reason = check_cpcb_averaging_eligibility(
        input_data.pollutant,
        input_data.valid_monitored_hours,
        total_window_hours=24
    )
    if not is_eligible:
        return None, elig_reason

    sub_val = calculate_official_cpcb_subindex(input_data.pollutant, conc)
    if sub_val is None:
        return None, f"Concentration {conc} outside CPCB breakpoint tables."

    eligible = EligibleSubIndex(
        pollutant=input_data.pollutant,
        sub_index=sub_val,
        averaging_hours=input_data.averaging_hours,
        valid_monitored_hours=input_data.valid_monitored_hours
    )
    return eligible, f"Eligible {input_data.pollutant} sub-index: {sub_val}."


def calculate_cpcb_overall_aqi(
    eligible_sub_indices: Union[List[EligibleSubIndex], Dict[str, Any]]
) -> Tuple[Optional[int], Optional[str], Optional[str], Optional[str]]:
    """Calculate overall Indian NAQI strictly from verified EligibleSubIndex objects.

    NOTE: This is a non-authoritative computational utility implementing CPCB mathematical formulas.
    It does NOT certify official CPCB NAQI status. Official statutory Indian NAQI requires certified
    CAAQMS station telemetry from Central Pollution Control Board / State Pollution Control Boards.

    Statutory CPCB Integrity & Verification Constraints:
    1. Rejects arbitrary unvalidated dictionaries of raw numbers.
    2. Does NOT treat publicly constructible EligibleSubIndex dataclasses as inherently verified:
       revalidates every object during overall aggregation (code in specs, finite sub_index in [0, 500],
       averaging duration matching statutory period, valid monitored hours >= minimum threshold).
    3. Counts UNIQUE eligible criteria pollutants (rejects duplicate pollutant entries from satisfying the >= 3 requirement).
    4. At least THREE unique criteria pollutants required.
    5. At least ONE of the valid pollutants MUST be PM2.5 or PM10 (particulate matter).
    6. Dominant pollutant is selected strictly from the unique validated eligible sub-indices.

    Returns:
        (overall_aqi, category, dominant_pollutant, ineligibility_reason)
    """
    if isinstance(eligible_sub_indices, dict):
        if any(not isinstance(val, EligibleSubIndex) for val in eligible_sub_indices.values()):
            return (
                None,
                None,
                None,
                "Arbitrary sub-index dictionary rejected: calculation strictly requires verified EligibleSubIndex objects conforming to CPCB data sufficiency rules."
            )
        raw_items = list(eligible_sub_indices.values())
    elif isinstance(eligible_sub_indices, list):
        if any(not isinstance(item, EligibleSubIndex) for item in eligible_sub_indices):
            return (
                None,
                None,
                None,
                "Arbitrary sub-index items rejected: list must contain verified EligibleSubIndex objects."
            )
        raw_items = eligible_sub_indices
    else:
        return None, None, None, "Invalid input type for CPCB NAQI calculation: expected List[EligibleSubIndex] or Dict[str, EligibleSubIndex]."

    # Strict Revalidation of every EligibleSubIndex object
    unique_sub_indices: Dict[str, EligibleSubIndex] = {}

    for item in raw_items:

        code = item.pollutant
        if code not in POLLUTANT_AVERAGING_SPECS:
            return (
                None,
                None,
                None,
                f"Unknown criteria pollutant code '{code}' rejected during CPCB revalidation."
            )

        spec = POLLUTANT_AVERAGING_SPECS[code]

        # Validate sub-index value: must be an integer, rejecting bool, float, NaN, Inf, strings, None
        si = item.sub_index
        if isinstance(si, bool) or not isinstance(si, int):
            return (
                None,
                None,
                None,
                f"Invalid sub-index value for {code}: must be an integer, received {type(si).__name__} ({si})."
            )

        if not (0 <= si <= 500):
            return (
                None,
                None,
                None,
                f"Sub-index for {code} ({si}) out of statutory bounds [0, 500]."
            )

        # Validate averaging duration
        if isinstance(item.averaging_hours, bool) or not isinstance(item.averaging_hours, int) or item.averaging_hours != spec["period_hours"]:
            return (
                None,
                None,
                None,
                f"Invalid averaging duration for {code}: requires {spec['period_hours']}-hour average, received {item.averaging_hours}."
            )

        # Validate monitored hours type and range before any numerical comparisons
        # Must be an integer (rejecting bool, float, NaN, Inf, string, None)
        vmh = item.valid_monitored_hours
        if isinstance(vmh, bool) or not isinstance(vmh, int):
            return (
                None,
                None,
                None,
                f"Invalid monitored hours for {code}: must be an integer, received {type(vmh).__name__} ({vmh})."
            )

        # Must be within inclusive range [0, 24]
        if not (0 <= vmh <= 24):
            return (
                None,
                None,
                None,
                f"Invalid monitored hours for {code}: must be within inclusive range [0, 24], received {vmh}."
            )

        # Validate full 24-hour station monitoring requirement for every pollutant during overall AQI aggregation:
        # - For PM2.5, PM10, NO2, SO2, NH3, and Pb: requires at least 16 valid monitored hours in the 24h cycle.
        # - For CO and O3: requires at least 16 valid monitored hours over the 24-hour diurnal cycle during aggregation.
        #   The 6-hour requirement applies strictly to individual 8-hour rolling windows (75% capture) and must
        #   NOT replace the 16-hour station-level requirement.
        min_station_hours = spec.get("min_diurnal_station_hours", 16)
        if vmh < min_station_hours:
            if code in ("CO", "O3"):
                return (
                    None,
                    None,
                    None,
                    f"Insufficient monitored hours for {code}: statutory diurnal station monitoring requires at least 16 hours over 24-hour cycle for overall AQI aggregation (received {vmh} hours; 6-hour requirement applies only to individual 8-hour rolling window)."
                )
            return (
                None,
                None,
                None,
                f"Insufficient monitored hours for {code}: requires at least {min_station_hours} hours over 24-hour cycle, received {vmh}."
            )

        # Validate metadata / provenance
        if not isinstance(item.provenance, str) or not item.provenance.strip():
            return None, None, None, f"Invalid metadata for {code}: missing or empty provenance."

        if "simulated" in item.provenance.lower() or "unverified" in item.provenance.lower():
            return (
                None,
                None,
                None,
                f"Ineligible provenance for {code}: simulated or unverified data rejected from CPCB NAQI calculation."
            )

        # Reject duplicate pollutant entries from satisfying the requirement
        if code in unique_sub_indices:
            return (
                None,
                None,
                None,
                f"Duplicate pollutant entry '{code}' rejected: duplicate entries cannot satisfy the minimum pollutant requirement."
            )

        unique_sub_indices[code] = item

    # Enforce at least 3 unique eligible criteria pollutants
    if len(unique_sub_indices) < 3:
        provided = len(unique_sub_indices)
        return (
            None,
            None,
            None,
            f"Ineligible for official CPCB NAQI: At least 3 eligible pollutant sub-indices required; only {provided} unique provided."
        )

    # Enforce at least one particulate pollutant (PM2.5 or PM10)
    has_pm = ("PM2.5" in unique_sub_indices) or ("PM10" in unique_sub_indices)
    if not has_pm:
        return (
            None,
            None,
            None,
            "Ineligible for official CPCB NAQI: Requires at least one particulate matter pollutant (PM2.5 or PM10)."
        )

    # Statutory rule: Dominant pollutant is selected strictly from validated unique eligible entries
    dominant = max(unique_sub_indices, key=lambda p: unique_sub_indices[p].sub_index)
    overall_aqi = int(round(unique_sub_indices[dominant].sub_index))

    # Map NAQI category
    if overall_aqi <= 50:
        category = "Good"
    elif overall_aqi <= 100:
        category = "Satisfactory"
    elif overall_aqi <= 200:
        category = "Moderate"
    elif overall_aqi <= 300:
        category = "Poor"
    elif overall_aqi <= 400:
        category = "Very Poor"
    else:
        category = "Severe"

    return overall_aqi, category, dominant, None


class CPCBProvider(BaseAirQualityProvider):
    """Statutory CPCB Provider Interface (Pending data.gov.in Official Key Verification)."""

    @property
    def provider_id(self) -> str:
        return "cpcb_india"

    @property
    def name(self) -> str:
        return "Central Pollution Control Board (CPCB India)"

    @property
    def classification(self) -> DataClassification:
        return DataClassification.OBSERVATION

    def is_configured(self) -> bool:
        """Requires authorized data.gov.in / OGD Ministry API verification."""
        return False

    async def get_current_air_quality(
        self,
        latitude: float,
        longitude: float
    ) -> NormalizedAirQualityResponse:
        """Returns structured explanation that official CPCB live key is pending registration."""
        retrieved_at = datetime.now(timezone.utc)
        return NormalizedAirQualityResponse(
            location=LocationMetadata(latitude=latitude, longitude=longitude, country="India"),
            provider=self.name,
            source_type=self.classification,
            retrieved_at=retrieved_at,
            observed_at=None,
            forecast_timestamp=None,
            retrieval_freshness=FreshnessStatus.NOT_CONFIGURED,
            freshness_status=FreshnessStatus.NOT_CONFIGURED,
            model_run_freshness=FreshnessStatus.UNAVAILABLE,
            observation_age_minutes=None,
            observation_freshness=None,
            quality_status=QualityStatus.UNAVAILABLE,
            indian_naqi=None,
            indian_naqi_category=None,
            indian_naqi_unavailable_reason=(
                "CPCB official physical station API integration is pending verified government portal API key access. "
                "Per integrity rules, no simulated data is passed as CPCB verified."
            ),
            dominant_pollutant=None,
            dominant_pollutant_methodology=None,
            dominant_pollutant_reason="Physical station data unavailable; statutory NAQI calculation suspended.",
            available_pollutants={},
            unavailable_pollutants=["PM2.5", "PM10", "NO2", "SO2", "CO", "O3", "NH3", "Pb"],
            source_attribution="CPCB (National Ambient Air Quality Monitoring Network - Pending Verified Key)",
            limitations=[
                "Official live CAAQMS data requires registered data.gov.in access under NDSAP.",
                "Unverified CPCB endpoints are not executed to prevent scraping or uncertified metrics."
            ]
        )

    async def get_forecast(
        self,
        latitude: float,
        longitude: float
    ) -> AirQualityForecastResponse:
        return AirQualityForecastResponse(
            location=LocationMetadata(latitude=latitude, longitude=longitude),
            provider=self.name,
            source_type=self.classification,
            retrieved_at=datetime.now(timezone.utc),
            hourly_forecast=[],
            source_attribution=self.name,
            limitations=["CPCB publishes physical ground station observations only; forecasts are not generated."]
        )
