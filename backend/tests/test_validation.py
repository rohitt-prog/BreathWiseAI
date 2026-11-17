"""Tests for data validation, coordinates, dispersion physics, dominant pollutant, and CPCB methodology."""
import pytest
from datetime import datetime, timezone, timedelta
from app.services.data_validation import (
    validate_coordinates,
    classify_freshness,
    classify_forecast_validity,
    calculate_observation_age_minutes,
    classify_observation_freshness,
    classify_model_run_freshness,
    parse_observation_timestamp,
    validate_pollutant_concentration,
    derive_wind_cardinal,
    derive_dispersion_conditions,
    determine_dominant_pollutant
)
from app.providers.cpcb import (
    calculate_official_cpcb_subindex,
    check_cpcb_averaging_eligibility,
    validate_and_calculate_cpcb_subindex,
    calculate_cpcb_overall_aqi,
    ValidatedAveragedConcentration,
    EligibleSubIndex,
    CPCB_BREAKPOINTS
)
from app.core.exceptions import CoordinateValidationError
from app.schemas.common import FreshnessStatus, ForecastValidityStatus, DataClassification
from app.schemas.air_quality import NormalizedPollutant
from app.schemas.weather import NormalizedWeatherResponse


def test_validate_coordinates_valid():
    coords = validate_coordinates(28.6508, 77.3152)
    assert coords.latitude == 28.6508
    assert coords.longitude == 77.3152

    coords_str = validate_coordinates("19.076", "72.877")
    assert coords_str.latitude == 19.076
    assert coords_str.longitude == 72.877


def test_validate_coordinates_invalid():
    with pytest.raises(CoordinateValidationError):
        validate_coordinates(95.0, 77.0)

    with pytest.raises(CoordinateValidationError):
        validate_coordinates(-91.0, 77.0)

    with pytest.raises(CoordinateValidationError):
        validate_coordinates(28.0, 185.0)

    with pytest.raises(CoordinateValidationError):
        validate_coordinates(28.0, -181.0)

    with pytest.raises(CoordinateValidationError):
        validate_coordinates("invalid", 77.0)


def test_classify_freshness_retrieval_age():
    now_utc = datetime.now(timezone.utc)

    # None timestamp is UNAVAILABLE
    assert classify_freshness(None) == FreshnessStatus.UNAVAILABLE

    # Within 30 minutes -> FRESH
    t_fresh = now_utc - timedelta(minutes=30)
    assert classify_freshness(t_fresh, max_fresh_minutes=60) == FreshnessStatus.FRESH

    # 90 minutes -> RECENT
    t_recent = now_utc - timedelta(minutes=90)
    assert classify_freshness(t_recent, max_fresh_minutes=60, max_stale_minutes=180) == FreshnessStatus.RECENT

    # Older than 180 minutes -> STALE
    t_stale = now_utc - timedelta(minutes=240)
    assert classify_freshness(t_stale, max_fresh_minutes=60, max_stale_minutes=180) == FreshnessStatus.STALE


def test_classify_forecast_validity_separated_from_retrieval():
    """Verify that forecast validity window is strictly distinct from retrieval freshness."""
    now_utc = datetime.now(timezone.utc)

    # Within ±60 minutes is current period
    t_now = now_utc + timedelta(minutes=10)
    assert classify_forecast_validity(t_now) == ForecastValidityStatus.CURRENT_PERIOD

    # Future hour (+5 hours)
    t_future = now_utc + timedelta(hours=5)
    assert classify_forecast_validity(t_future) == ForecastValidityStatus.FUTURE_PERIOD

    # Historical past (-3 hours)
    t_past = now_utc - timedelta(hours=3)
    assert classify_forecast_validity(t_past) == ForecastValidityStatus.HISTORICAL_PERIOD

    assert classify_forecast_validity(None) is None


def test_validate_pollutant_concentration():
    val, is_valid = validate_pollutant_concentration("PM2.5", 145.2, "µg/m³")
    assert is_valid is True
    assert val == 145.2

    val_none, is_valid_none = validate_pollutant_concentration("PM2.5", None, "µg/m³")
    assert is_valid_none is False
    assert val_none is None

    # Small negative clamped to 0.0
    val_noise, is_valid_noise = validate_pollutant_concentration("PM2.5", -0.2, "µg/m³")
    assert is_valid_noise is True
    assert val_noise == 0.0

    # Large negative rejected
    val_bad, is_valid_bad = validate_pollutant_concentration("PM2.5", -5.0, "µg/m³")
    assert is_valid_bad is False
    assert val_bad is None

    # Outlier clamped
    val_huge, is_valid_huge = validate_pollutant_concentration("PM2.5", 4500.0, "µg/m³")
    assert is_valid_huge is True
    assert val_huge == 3000.0


def test_derive_wind_cardinal():
    assert derive_wind_cardinal(0) == "N"
    assert derive_wind_cardinal(90) == "E"
    assert derive_wind_cardinal(180) == "S"
    assert derive_wind_cardinal(270) == "W"
    assert derive_wind_cardinal(290) == "WNW"
    assert derive_wind_cardinal(None) is None


def test_dispersion_conditions_heuristic_not_confirmed_inversion():
    """Verify that low PBL height and low wind speed produce only a documented heuristic,
    and DO NOT claim a confirmed temperature inversion or complete particulate trapping.
    """
    # Shallow boundary layer (180m) + calm winds (3.0 km/h)
    stagnation_risk, dispersion_conds, description = derive_dispersion_conditions(180.0, 3.0)
    assert stagnation_risk == "Elevated"
    assert dispersion_conds == "Potentially Unfavorable"

    # Must explicitly state it does NOT establish a confirmed inversion
    assert "does not establish a confirmed" in description.lower()
    assert "temperature inversion" in description.lower()
    assert "heuristic" in description.lower()
    # Must NOT claim all combustion pollutants are trapped
    assert "trapping all" not in description.lower()

    # Moderate boundary layer (400m)
    stagnation_mod, dispersion_mod, _ = derive_dispersion_conditions(400.0, 8.0)
    assert stagnation_mod == "Moderate"
    assert dispersion_mod == "Moderate"

    # Favorable ventilation (> 600m)
    stagnation_low, dispersion_fav, _ = derive_dispersion_conditions(850.0, 15.0)
    assert stagnation_low == "Low"
    assert dispersion_fav == "Favorable"

    # None telemetry cases
    stagnation_unk_pbl, dispersion_unk_pbl, desc_unk_pbl = derive_dispersion_conditions(None, 5.0)
    assert stagnation_unk_pbl == "Unknown"
    assert dispersion_unk_pbl == "Unknown"
    assert "boundary layer height telemetry unavailable" in desc_unk_pbl.lower()

    stagnation_unk_ws, dispersion_unk_ws, desc_unk_ws = derive_dispersion_conditions(200.0, None)
    assert stagnation_unk_ws == "Unknown"
    assert dispersion_unk_ws == "Unknown"
    assert "surface wind speed telemetry unavailable" in desc_unk_ws.lower()

    stagnation_unk_both, dispersion_unk_both, desc_unk_both = derive_dispersion_conditions(None, None)
    assert stagnation_unk_both == "Unknown"
    assert dispersion_unk_both == "Unknown"
    assert "telemetry unavailable" in desc_unk_both.lower()

    # Strict compliance: inversion_risk must NOT exist in schema
    assert "inversion_risk" not in NormalizedWeatherResponse.model_fields


def test_dominant_pollutant_modelled_data_returns_null_with_reason():
    """Verify that instantaneous modelled data CANNOT establish an official dominant pollutant (Preferred Approach)."""
    now = datetime.now(timezone.utc)

    pollutants_modelled = {
        "PM10": NormalizedPollutant(
            code="PM10", name="Coarse Particulates", concentration=85.0, unit="µg/m³",
            source="Test", measurement_timestamp=now, data_classification=DataClassification.MODELLED_FORECAST
        ),
        "PM2.5": NormalizedPollutant(
            code="PM2.5", name="Fine Particulates", concentration=80.0, unit="µg/m³",
            source="Test", measurement_timestamp=now, data_classification=DataClassification.MODELLED_FORECAST
        )
    }

    dominant, method, reason = determine_dominant_pollutant(pollutants_modelled, is_official_cpcb=False)
    assert dominant is None
    assert method is None
    assert "Instantaneous modelled concentrations cannot establish" in reason


def test_dominant_pollutant_official_cpcb_calculation():
    """Verify that official certified CPCB sub-indices establish dominant pollutant based on maximum sub-index."""
    now = datetime.now(timezone.utc)

    # Valid CPCB stations with sub-indices
    pollutants_cpcb_valid = {
        "PM2.5": NormalizedPollutant(
            code="PM2.5", name="Fine Particulates", concentration=180.0, unit="µg/m³",
            source="CPCB Station", measurement_timestamp=now, data_classification=DataClassification.OBSERVATION,
            sub_index=340
        ),
        "PM10": NormalizedPollutant(
            code="PM10", name="Coarse Particulates", concentration=220.0, unit="µg/m³",
            source="CPCB Station", measurement_timestamp=now, data_classification=DataClassification.OBSERVATION,
            sub_index=180
        ),
        "NO2": NormalizedPollutant(
            code="NO2", name="Nitrogen Dioxide", concentration=65.0, unit="µg/m³",
            source="CPCB Station", measurement_timestamp=now, data_classification=DataClassification.OBSERVATION,
            sub_index=82
        )
    }

    dom_valid, method_valid, reason_valid = determine_dominant_pollutant(pollutants_cpcb_valid, is_official_cpcb=True)
    assert dom_valid == "PM2.5"  # max(340, 180, 82) = 340 (PM2.5)
    assert "Official statutory CPCB methodology" in method_valid
    assert reason_valid is None

    # Ineligible: only 2 sub-indices
    pollutants_cpcb_insufficient = {
        "PM2.5": NormalizedPollutant(
            code="PM2.5", name="Fine Particulates", concentration=180.0, unit="µg/m³",
            source="CPCB Station", measurement_timestamp=now, data_classification=DataClassification.OBSERVATION,
            sub_index=340
        ),
        "NO2": NormalizedPollutant(
            code="NO2", name="Nitrogen Dioxide", concentration=65.0, unit="µg/m³",
            source="CPCB Station", measurement_timestamp=now, data_classification=DataClassification.OBSERVATION,
            sub_index=82
        )
    }
    dom_inelig, _, reason_inelig = determine_dominant_pollutant(pollutants_cpcb_insufficient, is_official_cpcb=True)
    assert dom_inelig is None
    assert "requires at least 3 valid sub-indices" in reason_inelig


def test_cpcb_pollutant_averaging_eligibility():
    """Test official CPCB pollutant-specific averaging requirements:
    - 24-hour averaging for PM2.5, PM10, NO2, SO2, NH3, Pb (min 16h valid).
    - 8-hour averaging for CO, O3 (min 16h diurnal coverage for rolling maximums).
    """
    # 24-hour pollutants: 18 hours valid -> PASS
    is_pm_ok, msg_pm_ok = check_cpcb_averaging_eligibility("PM2.5", valid_monitored_hours=18)
    assert is_pm_ok is True
    assert "Eligible for 24-hour" in msg_pm_ok

    # 24-hour pollutants: 14 hours valid (< 16h) -> FAIL
    is_pm_fail, msg_pm_fail = check_cpcb_averaging_eligibility("PM2.5", valid_monitored_hours=14)
    assert is_pm_fail is False
    assert "at least 16 valid hours" in msg_pm_fail

    # 8-hour pollutants (CO): 18 hours valid in 24h cycle -> PASS
    is_co_ok, msg_co_ok = check_cpcb_averaging_eligibility("CO", valid_monitored_hours=18, total_window_hours=24)
    assert is_co_ok is True
    assert "Eligible for 8-hour" in msg_co_ok

    # 8-hour pollutants (CO): 12 hours valid (< 16h) -> FAIL
    is_co_fail, msg_co_fail = check_cpcb_averaging_eligibility("CO", valid_monitored_hours=12, total_window_hours=24)
    assert is_co_fail is False
    assert "at least 16 hours of diurnal station monitoring" in msg_co_fail

    # 8-hour window (isolated 8h block): 6 hours valid meets 75% capture requirement -> PASS
    is_co_win_ok, msg_co_win_ok = check_cpcb_averaging_eligibility("CO", valid_monitored_hours=6, total_window_hours=8)
    assert is_co_win_ok is True
    assert "Eligible for 8-hour rolling sub-index" in msg_co_win_ok
    assert "75% window data capture" in msg_co_win_ok

    # 8-hour window (isolated 8h block): 5 hours valid (< 6h) -> FAIL
    is_co_win_fail, msg_co_win_fail = check_cpcb_averaging_eligibility("CO", valid_monitored_hours=5, total_window_hours=8)
    assert is_co_win_fail is False
    assert "requires at least 6 valid hourly measurements in 8-hour window" in msg_co_win_fail

    # Type & Range validation for check_cpcb_averaging_eligibility
    # - NaN rejected
    is_nan_ok, msg_nan = check_cpcb_averaging_eligibility("PM2.5", valid_monitored_hours=float("nan"))
    assert is_nan_ok is False
    assert "must be an integer" in msg_nan

    # - Positive infinity rejected
    is_inf_ok, msg_inf = check_cpcb_averaging_eligibility("PM2.5", valid_monitored_hours=float("inf"))
    assert is_inf_ok is False
    assert "must be an integer" in msg_inf

    # - Negative infinity rejected
    is_ninf_ok, msg_ninf = check_cpcb_averaging_eligibility("PM2.5", valid_monitored_hours=float("-inf"))
    assert is_ninf_ok is False
    assert "must be an integer" in msg_ninf

    # - Fractional float rejected
    is_frac_ok, msg_frac = check_cpcb_averaging_eligibility("PM2.5", valid_monitored_hours=16.5)
    assert is_frac_ok is False
    assert "must be an integer" in msg_frac

    # - Boolean rejected (bool is subclass of int)
    is_bool_ok, msg_bool = check_cpcb_averaging_eligibility("PM2.5", valid_monitored_hours=True)
    assert is_bool_ok is False
    assert "must be an integer" in msg_bool

    # - Boolean total_window_hours rejected
    is_win_bool_ok, msg_win_bool = check_cpcb_averaging_eligibility("CO", valid_monitored_hours=6, total_window_hours=True)
    assert is_win_bool_ok is False
    assert "must be an integer" in msg_win_bool

    # - Out of range (< 0 or > window) rejected
    is_neg_ok, msg_neg = check_cpcb_averaging_eligibility("PM2.5", valid_monitored_hours=-2)
    assert is_neg_ok is False
    assert "must be within [0, 24]" in msg_neg

    is_over_ok, msg_over = check_cpcb_averaging_eligibility("PM2.5", valid_monitored_hours=25)
    assert is_over_ok is False
    assert "must be within [0, 24]" in msg_over

    # - Valid boundary integer 16 accepted
    is_16_ok, msg_16 = check_cpcb_averaging_eligibility("PM2.5", valid_monitored_hours=16)
    assert is_16_ok is True
    assert "Eligible for 24-hour" in msg_16


def test_cpcb_overall_aqi_minimum_pollutant_rules():
    """Test statutory CPCB rules for overall AQI calculation strictly with EligibleSubIndex objects:
    1. Rejection of arbitrary unvalidated dictionaries.
    2. Minimum 3 criteria pollutants required.
    3. At least one must be PM2.5 or PM10.
    """
    # 1. Arbitrary unverified dictionary of raw integers is STRICTLY REJECTED
    aqi_raw, _, _, reason_raw = calculate_cpcb_overall_aqi({"PM2.5": 250, "NO2": 80, "CO": 90})
    assert aqi_raw is None
    assert "Arbitrary sub-index dictionary rejected" in reason_raw

    # Create verified EligibleSubIndex objects
    sub_pm25 = EligibleSubIndex(pollutant="PM2.5", sub_index=320, averaging_hours=24, valid_monitored_hours=18)
    sub_no2 = EligibleSubIndex(pollutant="NO2", sub_index=85, averaging_hours=24, valid_monitored_hours=18)
    sub_co = EligibleSubIndex(pollutant="CO", sub_index=110, averaging_hours=8, valid_monitored_hours=18)
    sub_so2 = EligibleSubIndex(pollutant="SO2", sub_index=45, averaging_hours=24, valid_monitored_hours=18)

    # FAILS: Only 2 pollutants
    aqi_2, _, _, reason_2 = calculate_cpcb_overall_aqi([sub_pm25, sub_no2])
    assert aqi_2 is None
    assert "At least 3 eligible pollutant sub-indices required" in reason_2

    # FAILS: 3 pollutants, but NO particulate matter (NO2, SO2, CO)
    aqi_nopm, _, _, reason_nopm = calculate_cpcb_overall_aqi([sub_no2, sub_so2, sub_co])
    assert aqi_nopm is None
    assert "Requires at least one particulate matter pollutant" in reason_nopm

    # PASSES: 3 eligible pollutants including PM2.5
    aqi_pass, cat_pass, dom_pass, reason_pass = calculate_cpcb_overall_aqi([sub_pm25, sub_no2, sub_co])
    assert aqi_pass == 320
    assert cat_pass == "Very Poor"
    assert dom_pass == "PM2.5"
    assert reason_pass is None

    # FAILS: Duplicate pollutant entries cannot satisfy the 3-pollutant requirement
    sub_pm25_dup = EligibleSubIndex(pollutant="PM2.5", sub_index=310, averaging_hours=24, valid_monitored_hours=18)
    aqi_dup, _, _, reason_dup = calculate_cpcb_overall_aqi([sub_pm25, sub_pm25_dup, sub_no2])
    assert aqi_dup is None
    assert "Duplicate pollutant entry" in reason_dup

    # FAILS: Publicly constructed EligibleSubIndex with tampered/invalid fields are REVALIDATED and REJECTED
    # 1. Unknown pollutant code
    sub_bad_code = EligibleSubIndex(pollutant="UNKNOWN", sub_index=150, averaging_hours=24, valid_monitored_hours=18)
    aqi_bad_code, _, _, r_bad_code = calculate_cpcb_overall_aqi([sub_bad_code, sub_no2, sub_co])
    assert aqi_bad_code is None
    assert "Unknown criteria pollutant code" in r_bad_code

    # 2. Sub-index out of bounds (> 500 or < 0)
    sub_high = EligibleSubIndex(pollutant="PM2.5", sub_index=501, averaging_hours=24, valid_monitored_hours=18)
    aqi_high, _, _, r_high = calculate_cpcb_overall_aqi([sub_high, sub_no2, sub_co])
    assert aqi_high is None
    assert "out of statutory bounds" in r_high

    sub_neg = EligibleSubIndex(pollutant="PM2.5", sub_index=-10, averaging_hours=24, valid_monitored_hours=18)
    aqi_neg, _, _, r_neg = calculate_cpcb_overall_aqi([sub_neg, sub_no2, sub_co])
    assert aqi_neg is None
    assert "out of statutory bounds" in r_neg

    # 3. Invalid sub-index types (booleans, fractional floats, NaN, infinity)
    # - sub_index=True rejected
    sub_bool_t = EligibleSubIndex(pollutant="PM2.5", sub_index=True, averaging_hours=24, valid_monitored_hours=18)
    aqi_bt, _, _, r_bt = calculate_cpcb_overall_aqi([sub_bool_t, sub_no2, sub_co])
    assert aqi_bt is None
    assert "must be an integer" in r_bt

    # - sub_index=False rejected
    sub_bool_f = EligibleSubIndex(pollutant="PM2.5", sub_index=False, averaging_hours=24, valid_monitored_hours=18)
    aqi_bf, _, _, r_bf = calculate_cpcb_overall_aqi([sub_bool_f, sub_no2, sub_co])
    assert aqi_bf is None
    assert "must be an integer" in r_bf

    # - sub_index=150.5 (fractional float) rejected
    sub_frac = EligibleSubIndex(pollutant="PM2.5", sub_index=150.5, averaging_hours=24, valid_monitored_hours=18)
    aqi_frac, _, _, r_frac = calculate_cpcb_overall_aqi([sub_frac, sub_no2, sub_co])
    assert aqi_frac is None
    assert "must be an integer" in r_frac

    # - sub_index=float("nan") rejected
    sub_nan = EligibleSubIndex(pollutant="PM2.5", sub_index=float("nan"), averaging_hours=24, valid_monitored_hours=18)
    aqi_nan, _, _, r_nan = calculate_cpcb_overall_aqi([sub_nan, sub_no2, sub_co])
    assert aqi_nan is None
    assert "must be an integer" in r_nan

    # - sub_index=float("inf") rejected
    sub_inf = EligibleSubIndex(pollutant="PM2.5", sub_index=float("inf"), averaging_hours=24, valid_monitored_hours=18)
    aqi_inf, _, _, r_inf = calculate_cpcb_overall_aqi([sub_inf, sub_no2, sub_co])
    assert aqi_inf is None
    assert "must be an integer" in r_inf

    # - Boundary integers 0 and 500 accepted
    sub_0_pm25 = EligibleSubIndex(pollutant="PM2.5", sub_index=0, averaging_hours=24, valid_monitored_hours=18)
    sub_0_no2 = EligibleSubIndex(pollutant="NO2", sub_index=0, averaging_hours=24, valid_monitored_hours=18)
    sub_0_co = EligibleSubIndex(pollutant="CO", sub_index=0, averaging_hours=8, valid_monitored_hours=18)
    aqi_0, cat_0, dom_0, r_0 = calculate_cpcb_overall_aqi([sub_0_pm25, sub_0_no2, sub_0_co])
    assert aqi_0 == 0
    assert cat_0 == "Good"
    assert dom_0 == "PM2.5"
    assert r_0 is None

    sub_500_pm25 = EligibleSubIndex(pollutant="PM2.5", sub_index=500, averaging_hours=24, valid_monitored_hours=18)
    aqi_500, cat_500, dom_500, r_500 = calculate_cpcb_overall_aqi([sub_500_pm25, sub_no2, sub_co])
    assert aqi_500 == 500
    assert cat_500 == "Severe"
    assert dom_500 == "PM2.5"
    assert r_500 is None

    # 4. Invalid averaging hours (8h instead of 24h for PM2.5)
    sub_bad_avg = EligibleSubIndex(pollutant="PM2.5", sub_index=150, averaging_hours=8, valid_monitored_hours=18)
    aqi_bad_avg, _, _, r_bad_avg = calculate_cpcb_overall_aqi([sub_bad_avg, sub_no2, sub_co])
    assert aqi_bad_avg is None
    assert "Invalid averaging duration" in r_bad_avg

    # 5. Insufficient monitored hours (< 16h)
    sub_low_hours = EligibleSubIndex(pollutant="PM2.5", sub_index=150, averaging_hours=24, valid_monitored_hours=12)
    aqi_low_hours, _, _, r_low_hours = calculate_cpcb_overall_aqi([sub_low_hours, sub_no2, sub_co])
    assert aqi_low_hours is None
    assert "Insufficient monitored hours" in r_low_hours

    # 6. Simulated / unverified provenance
    sub_sim = EligibleSubIndex(
        pollutant="PM2.5", sub_index=150, averaging_hours=24, valid_monitored_hours=18,
        provenance="Simulated unverified demo data"
    )
    aqi_sim, _, _, r_sim = calculate_cpcb_overall_aqi([sub_sim, sub_no2, sub_co])
    assert aqi_sim is None
    assert "Ineligible provenance" in r_sim

    # 7. Monitored-hours revalidation for 8-hour rolling pollutants (CO and O3):
    # - CO with 6 monitored hours is REJECTED during aggregation
    sub_co_6h = EligibleSubIndex(pollutant="CO", sub_index=110, averaging_hours=8, valid_monitored_hours=6)
    aqi_co_6h, _, _, r_co_6h = calculate_cpcb_overall_aqi([sub_pm25, sub_no2, sub_co_6h])
    assert aqi_co_6h is None
    assert "Insufficient monitored hours for CO" in r_co_6h
    assert "at least 16 hours over 24-hour cycle" in r_co_6h

    # - O3 with 6 monitored hours is REJECTED during aggregation
    sub_o3_6h = EligibleSubIndex(pollutant="O3", sub_index=120, averaging_hours=8, valid_monitored_hours=6)
    aqi_o3_6h, _, _, r_o3_6h = calculate_cpcb_overall_aqi([sub_pm25, sub_no2, sub_o3_6h])
    assert aqi_o3_6h is None
    assert "Insufficient monitored hours for O3" in r_o3_6h
    assert "at least 16 hours over 24-hour cycle" in r_o3_6h

    # - CO with 16 monitored hours PASSES monitored-hours check during aggregation
    sub_co_16h = EligibleSubIndex(pollutant="CO", sub_index=110, averaging_hours=8, valid_monitored_hours=16)
    aqi_co_16h, cat_co, dom_co, r_co_16h = calculate_cpcb_overall_aqi([sub_pm25, sub_no2, sub_co_16h])
    assert aqi_co_16h == 320
    assert cat_co == "Very Poor"
    assert dom_co == "PM2.5"
    assert r_co_16h is None

    # - O3 with 16 monitored hours PASSES monitored-hours check during aggregation
    sub_o3_16h = EligibleSubIndex(pollutant="O3", sub_index=120, averaging_hours=8, valid_monitored_hours=16)
    aqi_o3_16h, cat_o3, dom_o3, r_o3_16h = calculate_cpcb_overall_aqi([sub_pm25, sub_no2, sub_o3_16h])
    assert aqi_o3_16h == 320
    assert cat_o3 == "Very Poor"
    assert dom_o3 == "PM2.5"
    assert r_o3_16h is None

    # - Monitored hours exceeding 24 in a diurnal cycle is REJECTED
    sub_co_25h = EligibleSubIndex(pollutant="CO", sub_index=110, averaging_hours=8, valid_monitored_hours=25)
    aqi_co_25h, _, _, r_co_25h = calculate_cpcb_overall_aqi([sub_pm25, sub_no2, sub_co_25h])
    assert aqi_co_25h is None
    assert "within inclusive range [0, 24]" in r_co_25h

    # 8. Type & range hardening for valid_monitored_hours in calculate_cpcb_overall_aqi():
    # - NaN monitored hours rejected
    sub_nan_hrs = EligibleSubIndex(pollutant="PM2.5", sub_index=150, averaging_hours=24, valid_monitored_hours=float("nan"))
    aqi_nan_hrs, _, _, r_nan_hrs = calculate_cpcb_overall_aqi([sub_nan_hrs, sub_no2, sub_co])
    assert aqi_nan_hrs is None
    assert "must be an integer" in r_nan_hrs

    # - Positive infinity rejected
    sub_inf_hrs = EligibleSubIndex(pollutant="PM2.5", sub_index=150, averaging_hours=24, valid_monitored_hours=float("inf"))
    aqi_inf_hrs, _, _, r_inf_hrs = calculate_cpcb_overall_aqi([sub_inf_hrs, sub_no2, sub_co])
    assert aqi_inf_hrs is None
    assert "must be an integer" in r_inf_hrs

    # - Negative infinity rejected
    sub_ninf_hrs = EligibleSubIndex(pollutant="PM2.5", sub_index=150, averaging_hours=24, valid_monitored_hours=float("-inf"))
    aqi_ninf_hrs, _, _, r_ninf_hrs = calculate_cpcb_overall_aqi([sub_ninf_hrs, sub_no2, sub_co])
    assert aqi_ninf_hrs is None
    assert "must be an integer" in r_ninf_hrs

    # - Fractional monitored hours rejected
    sub_frac_hrs = EligibleSubIndex(pollutant="PM2.5", sub_index=150, averaging_hours=24, valid_monitored_hours=18.5)
    aqi_frac_hrs, _, _, r_frac_hrs = calculate_cpcb_overall_aqi([sub_frac_hrs, sub_no2, sub_co])
    assert aqi_frac_hrs is None
    assert "must be an integer" in r_frac_hrs

    # - Boolean monitored hours rejected (bool is subclass of int)
    sub_bool_hrs = EligibleSubIndex(pollutant="PM2.5", sub_index=150, averaging_hours=24, valid_monitored_hours=True)
    aqi_bool_hrs, _, _, r_bool_hrs = calculate_cpcb_overall_aqi([sub_bool_hrs, sub_no2, sub_co])
    assert aqi_bool_hrs is None
    assert "must be an integer" in r_bool_hrs

    # - Negative integer out-of-range (< 0) rejected
    sub_neg_hrs = EligibleSubIndex(pollutant="PM2.5", sub_index=150, averaging_hours=24, valid_monitored_hours=-3)
    aqi_neg_hrs, _, _, r_neg_hrs = calculate_cpcb_overall_aqi([sub_neg_hrs, sub_no2, sub_co])
    assert aqi_neg_hrs is None
    assert "within inclusive range [0, 24]" in r_neg_hrs

    # - Valid boundary integer 16 accepted across all pollutants
    sub_16_pm25 = EligibleSubIndex(pollutant="PM2.5", sub_index=320, averaging_hours=24, valid_monitored_hours=16)
    sub_16_no2 = EligibleSubIndex(pollutant="NO2", sub_index=85, averaging_hours=24, valid_monitored_hours=16)
    sub_16_co = EligibleSubIndex(pollutant="CO", sub_index=110, averaging_hours=8, valid_monitored_hours=16)
    aqi_16, cat_16, dom_16, r_16 = calculate_cpcb_overall_aqi([sub_16_pm25, sub_16_no2, sub_16_co])
    assert aqi_16 == 320
    assert cat_16 == "Very Poor"
    assert dom_16 == "PM2.5"
    assert r_16 is None


def test_cpcb_subindex_eligibility_safeguards():
    """Verify that validate_and_calculate_cpcb_subindex enforces:
    - Physical observation requirement (rejects modelled/simulated data)
    - Correct unit validation (rejects invalid units e.g. ppm, ppb, mg/m³ for PM)
    - Explicit unit conversion for CO (µg/m³ to mg/m³)
    - Pollutant-specific averaging period (24h vs 8h)
    - Minimum 16-hour valid monitoring requirement
    """
    # 1. Valid PM2.5 observation
    valid_pm = ValidatedAveragedConcentration(
        pollutant="PM2.5",
        concentration=180.0,
        unit="µg/m³",
        averaging_hours=24,
        valid_monitored_hours=18,
        data_classification=DataClassification.OBSERVATION,
        is_physical_observation=True
    )
    eligible_pm, msg_pm = validate_and_calculate_cpcb_subindex(valid_pm)
    assert eligible_pm is not None
    assert eligible_pm.sub_index == 347
    assert "Eligible" in msg_pm

    # 2. Rejection of Modelled Data
    modelled_pm = ValidatedAveragedConcentration(
        pollutant="PM2.5",
        concentration=180.0,
        unit="µg/m³",
        averaging_hours=24,
        valid_monitored_hours=24,
        data_classification=DataClassification.MODELLED_FORECAST,
        is_physical_observation=False
    )
    elig_mod, msg_mod = validate_and_calculate_cpcb_subindex(modelled_pm)
    assert elig_mod is None
    assert "Modelled forecast or simulated data" in msg_mod

    # 3. Rejection of Invalid Units
    bad_unit_pm = ValidatedAveragedConcentration(
        pollutant="PM2.5",
        concentration=180.0,
        unit="ppm",
        averaging_hours=24,
        valid_monitored_hours=18
    )
    elig_unit, msg_unit = validate_and_calculate_cpcb_subindex(bad_unit_pm)
    assert elig_unit is None
    assert "Invalid unit 'ppm'" in msg_unit

    # 4. Valid CO with µg/m³ conversion
    co_ug = ValidatedAveragedConcentration(
        pollutant="CO",
        concentration=2500.0,  # 2500 µg/m³ = 2.5 mg/m³
        unit="µg/m³",
        averaging_hours=8,
        valid_monitored_hours=18
    )
    elig_co, msg_co = validate_and_calculate_cpcb_subindex(co_ug)
    assert elig_co is not None
    assert elig_co.sub_index > 0

    # 5. Rejection of Invalid Averaging Duration (8h for PM2.5 instead of 24h)
    bad_hours_pm = ValidatedAveragedConcentration(
        pollutant="PM2.5",
        concentration=180.0,
        unit="µg/m³",
        averaging_hours=8,
        valid_monitored_hours=8
    )
    elig_hrs, msg_hrs = validate_and_calculate_cpcb_subindex(bad_hours_pm)
    assert elig_hrs is None
    assert "requires 24-hour average" in msg_hrs

    # 6. Rejection of Insufficient Monitoring Capture (14h < 16h)
    low_data_pm = ValidatedAveragedConcentration(
        pollutant="PM2.5",
        concentration=180.0,
        unit="µg/m³",
        averaging_hours=24,
        valid_monitored_hours=14
    )
    elig_low, msg_low = validate_and_calculate_cpcb_subindex(low_data_pm)
    assert elig_low is None
    assert "at least 16 valid hours" in msg_low

    # 7. Rejection of Non-Finite Concentrations (NaN and Inf)
    nan_pm = ValidatedAveragedConcentration(
        pollutant="PM2.5",
        concentration=float("nan"),
        unit="µg/m³",
        averaging_hours=24,
        valid_monitored_hours=18
    )
    elig_nan, msg_nan = validate_and_calculate_cpcb_subindex(nan_pm)
    assert elig_nan is None
    assert "Non-finite concentration" in msg_nan

    inf_pm = ValidatedAveragedConcentration(
        pollutant="PM2.5",
        concentration=float("inf"),
        unit="µg/m³",
        averaging_hours=24,
        valid_monitored_hours=18
    )
    elig_inf, msg_inf = validate_and_calculate_cpcb_subindex(inf_pm)
    assert elig_inf is None
    assert "Non-finite concentration" in msg_inf

    # 8. Rejection of Exact Non-conforming Units (preventing substring false positives like mg/L or mg/kg)
    bad_mgl_co = ValidatedAveragedConcentration(
        pollutant="CO",
        concentration=2.5,
        unit="mg/L",  # Water concentration unit, NOT atmospheric
        averaging_hours=8,
        valid_monitored_hours=18
    )
    elig_mgl, msg_mgl = validate_and_calculate_cpcb_subindex(bad_mgl_co)
    assert elig_mgl is None
    assert "Invalid unit 'mg/L'" in msg_mgl

    bad_mgkg_co = ValidatedAveragedConcentration(
        pollutant="CO",
        concentration=2.5,
        unit="mg/kg",  # Soil mass unit, NOT atmospheric
        averaging_hours=8,
        valid_monitored_hours=18
    )
    elig_mgkg, msg_mgkg = validate_and_calculate_cpcb_subindex(bad_mgkg_co)
    assert elig_mgkg is None
    assert "Invalid unit 'mg/kg'" in msg_mgkg

    bad_mg_pm = ValidatedAveragedConcentration(
        pollutant="PM2.5",
        concentration=0.18,
        unit="mg/m³",  # PM standard is strictly µg/m³
        averaging_hours=24,
        valid_monitored_hours=18
    )
    elig_mg_pm, msg_mg_pm = validate_and_calculate_cpcb_subindex(bad_mg_pm)
    assert elig_mg_pm is None
    assert "Invalid unit 'mg/m³' for PM2.5" in msg_mg_pm


def test_observation_timestamp_validation_and_future_rejection():
    """Verify that:
    - Timezone-aware UTC and offset timestamps are correctly parsed and normalized.
    - Naive timestamps are rejected when explicit timezone is required.
    - Future-dated timestamps beyond clock skew (120s) are rejected and return INVALID.
    - Near-future timestamps within clock skew (<= 120s) are safely clamped to 0.0.
    """
    ref_time = datetime(2026, 11, 29, 12, 0, 0, tzinfo=timezone.utc)

    # 1. Valid UTC string
    dt_utc, valid_utc, _ = parse_observation_timestamp("2026-11-29T10:00:00Z")
    assert valid_utc is True
    assert dt_utc.tzinfo == timezone.utc
    assert dt_utc.hour == 10

    # 2. Valid timezone offset string (+05:30 Indian Standard Time)
    dt_ist, valid_ist, _ = parse_observation_timestamp("2026-11-29T15:30:00+05:30")
    assert valid_ist is True
    assert dt_ist.tzinfo == timezone.utc
    assert dt_ist.hour == 10  # 15:30 IST is 10:00 UTC

    # 3. Naive string rejected when explicit timezone required
    dt_naive, valid_naive, err_naive = parse_observation_timestamp("2026-11-29T10:00:00", require_explicit_timezone=True)
    assert valid_naive is False
    assert "lacks timezone offset information" in err_naive

    # 4. Naive string safely assumed UTC when allowed
    dt_naive_ok, valid_naive_ok, _ = parse_observation_timestamp("2026-11-29T10:00:00", require_explicit_timezone=False)
    assert valid_naive_ok is True
    assert dt_naive_ok.tzinfo == timezone.utc

    # 5. Future-dated observation (10 minutes in future relative to ref_time)
    future_dt = ref_time + timedelta(minutes=10)
    future_age = calculate_observation_age_minutes(future_dt, ref_time, max_clock_skew_seconds=120)
    assert future_age is None  # Must return None, rejecting the future observation

    future_freshness = classify_observation_freshness(future_dt, ref_time, max_clock_skew_seconds=120)
    assert future_freshness == FreshnessStatus.INVALID  # Must NOT be classified as FRESH

    # 6. Near-future observation within clock-skew tolerance (30 seconds ahead)
    skew_dt = ref_time + timedelta(seconds=30)
    skew_age = calculate_observation_age_minutes(skew_dt, ref_time, max_clock_skew_seconds=120)
    assert skew_age == 0.0  # Safely clamped to 0.0
    skew_freshness = classify_observation_freshness(skew_dt, ref_time, max_clock_skew_seconds=120)
    assert skew_freshness == FreshnessStatus.FRESH


def test_cpcb_piecewise_linear_breakpoints():
    """Verify official CPCB breakpoint calculations."""
    # PM2.5: 375 µg/m³ falls in [250, 500] -> sub-index in (450, 451)
    assert calculate_official_cpcb_subindex("PM2.5", 375.0) in (450, 451)

    # PM2.5: 60 µg/m³ is upper breakpoint of Satisfactory -> 100
    assert calculate_official_cpcb_subindex("PM2.5", 60.0) == 100

    # Negative concentration -> None
    assert calculate_official_cpcb_subindex("PM2.5", -10.0) is None

    # Non-finite concentrations -> None
    assert calculate_official_cpcb_subindex("PM2.5", float("nan")) is None
    assert calculate_official_cpcb_subindex("PM2.5", float("inf")) is None

    # Exceeding 500 breakpoint -> capped at 500
    assert calculate_official_cpcb_subindex("PM2.5", 650.0) == 500


def test_freshness_dimensions_separation():
    """Verify strict separation of retrieval freshness, model run freshness,
    forecast validity, and observation age.
    """
    now = datetime.now(timezone.utc)

    # 1. Observation age & freshness
    assert calculate_observation_age_minutes(None) is None
    assert classify_observation_freshness(None) is None

    t_obs_fresh = now - timedelta(minutes=25)
    assert calculate_observation_age_minutes(t_obs_fresh, now) == 25.0
    assert classify_observation_freshness(t_obs_fresh, now) == FreshnessStatus.FRESH

    t_obs_recent = now - timedelta(minutes=90)
    assert calculate_observation_age_minutes(t_obs_recent, now) == 90.0
    assert classify_observation_freshness(t_obs_recent, now) == FreshnessStatus.RECENT

    t_obs_stale = now - timedelta(minutes=240)
    assert calculate_observation_age_minutes(t_obs_stale, now) == 240.0
    assert classify_observation_freshness(t_obs_stale, now) == FreshnessStatus.STALE

    # 2. Model run freshness
    assert classify_model_run_freshness(None) == FreshnessStatus.UNAVAILABLE
    t_model_fresh = now - timedelta(hours=2)
    assert classify_model_run_freshness(t_model_fresh) == FreshnessStatus.FRESH


def test_raw_concentrations_never_compared_for_dominant_pollutant():
    """Prove that raw concentrations across pollutants with different units/scales
    (e.g., CO in µg/m³ vs PM2.5 in µg/m³) are NEVER directly compared.
    """
    now = datetime.now(timezone.utc)

    # In this dataset, raw CO is numerically huge (2500 µg/m³), while PM2.5 is 85 µg/m³
    pollutants = {
        "CO": NormalizedPollutant(
            code="CO", name="Carbon Monoxide", concentration=2500.0, unit="µg/m³",
            source="Test", measurement_timestamp=now, data_classification=DataClassification.MODELLED_FORECAST
        ),
        "PM2.5": NormalizedPollutant(
            code="PM2.5", name="Fine Particulates", concentration=85.0, unit="µg/m³",
            source="Test", measurement_timestamp=now, data_classification=DataClassification.MODELLED_FORECAST
        ),
        "NO2": NormalizedPollutant(
            code="NO2", name="Nitrogen Dioxide", concentration=120.0, unit="µg/m³",
            source="Test", measurement_timestamp=now, data_classification=DataClassification.MODELLED_FORECAST
        )
    }

    # For modelled data, dominant pollutant MUST be None regardless of raw concentration scales
    dominant, method, reason = determine_dominant_pollutant(pollutants, is_official_cpcb=False)
    assert dominant is None
    assert method is None
    assert "Instantaneous modelled concentrations cannot establish" in reason
