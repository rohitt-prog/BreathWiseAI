"""Comprehensive regression test suite for Phase 5 Google Gemini AI Service & Deterministic Safety Engine."""
import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock

from app.schemas.common import (
    DataClassification,
    FreshnessStatus,
    ForecastValidityStatus,
    QualityStatus,
    LocationMetadata
)
from app.schemas.air_quality import NormalizedAirQualityResponse, NormalizedPollutant
from app.schemas.weather import NormalizedWeatherResponse
from app.schemas.ai import (
    ActivityContext,
    AIGenerationStatus,
    ActionCategory,
    ActionPriority,
    AIInsightRequest,
    AIInsightAction,
    AIStructuredSynthesis,
    EnvironmentalEvidenceContext,
    EnvironmentalEvidenceItem
)
from app.services.ai_service import AIService
from app.services.evidence_builder import build_evidence_context
from app.services.deterministic_safety import DeterministicSafetyEngine, CANONICAL_ACTIONS, SUPPORTED_POLLUTANTS_CONFIG
from app.ai.gemini_service import GeminiService
from app.ai.prompt_manager import PROMPT_VERSION, build_insight_prompt
from google.genai import errors


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_location():
    return LocationMetadata(
        latitude=28.65,
        longitude=77.25,
        name="Delhi Central (Test)",
        city="Delhi",
        state="Delhi",
        country="India"
    )


@pytest.fixture
def sample_modelled_air_quality(sample_location):
    now = datetime.now(timezone.utc)
    return NormalizedAirQualityResponse(
        location=sample_location,
        provider="Open-Meteo CAMS",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        observed_at=None,
        forecast_timestamp=now,
        retrieval_freshness=FreshnessStatus.FRESH,
        freshness_status=FreshnessStatus.FRESH,
        quality_status=QualityStatus.MODELLED_APPROXIMATION,
        indian_naqi=None,
        indian_naqi_category=None,
        indian_naqi_unavailable_reason="Modelled forecast data cannot compute statutory Indian NAQI.",
        dominant_pollutant=None,
        dominant_pollutant_reason="Instantaneous modelled concentrations cannot establish dominant pollutant.",
        available_pollutants={
            "PM2.5": NormalizedPollutant(
                code="PM2.5",
                name="Fine Particulates",
                concentration=85.0,
                unit="µg/m³",
                source="Open-Meteo CAMS",
                measurement_timestamp=now,
                data_classification=DataClassification.MODELLED_FORECAST,
                validation_status=FreshnessStatus.FRESH
            ),
            "PM10": NormalizedPollutant(
                code="PM10",
                name="Coarse Particulates",
                concentration=145.0,
                unit="µg/m³",
                source="Open-Meteo CAMS",
                measurement_timestamp=now,
                data_classification=DataClassification.MODELLED_FORECAST,
                validation_status=FreshnessStatus.FRESH
            ),
            "NO2": NormalizedPollutant(
                code="NO2",
                name="Nitrogen Dioxide",
                concentration=45.0,
                unit="µg/m³",
                source="Open-Meteo CAMS",
                measurement_timestamp=now,
                data_classification=DataClassification.MODELLED_FORECAST,
                validation_status=FreshnessStatus.FRESH
            )
        },
        source_attribution="Open-Meteo European CAMS",
        limitations=["CAMS ~40km grid resolution; not localized to street level."]
    )


@pytest.fixture
def sample_weather(sample_location):
    now = datetime.now(timezone.utc)
    return NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo Forecast",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp=now,
        retrieval_freshness=FreshnessStatus.FRESH,
        temperature_c=22.0,
        relative_humidity=65.0,
        wind_speed_kmh=5.5,
        wind_direction_degrees=290.0,
        wind_direction_cardinal="WNW",
        boundary_layer_height_meters=230.0,
        stagnation_risk="Elevated",
        dispersion_conditions="Potentially Unfavorable",
        stagnation_description="Low boundary layer mixing ceiling and weak winds indicate potentially unfavorable dispersion.",
        source_attribution="Open-Meteo NWP",
        limitations=["Surface parameters derived from regional weather model."]
    )


@pytest.fixture
def valid_gemini_synthesis():
    return AIStructuredSynthesis(
        summary="Atmospheric dispersion is potentially unfavorable with elevated fine particulate levels.",
        explanation=(
            "Modelled PM2.5 concentrations reach 85.0 µg/m³ under a shallow 230m boundary layer ceiling. "
            "Surface winds of 5.5 km/h limit horizontal ventilation, promoting temporary localized aerosol accumulation."
        ),
        supporting_factors=[
            "Elevated PM2.5 concentration (85.0 µg/m³)",
            "Shallow boundary layer ceiling (230m)",
            "Weak surface ventilation (5.5 km/h)"
        ],
        recommended_actions=[
            AIInsightAction(
                action_id="ACT-PROTECT-N95-STREET",
                category=ActionCategory.PERSONAL_PROTECTION,
                priority=ActionPriority.HIGH,
                title=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].title,
                rationale=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].rationale,
                evidence_ids=["EVID-PM25"]
            ),
            AIInsightAction(
                action_id="ACT-VENT-PURIFY-HEPA",
                category=ActionCategory.INDOOR_AIR,
                priority=ActionPriority.HIGH,
                title=CANONICAL_ACTIONS["ACT-VENT-PURIFY-HEPA"].title,
                rationale=CANONICAL_ACTIONS["ACT-VENT-PURIFY-HEPA"].rationale,
                evidence_ids=["EVID-PM25"]
            ),
            AIInsightAction(
                action_id="ACT-VENT-SEAL-TEMPORARY",
                category=ActionCategory.VENTILATION,
                priority=ActionPriority.HIGH,
                title=CANONICAL_ACTIONS["ACT-VENT-SEAL-TEMPORARY"].title,
                rationale=CANONICAL_ACTIONS["ACT-VENT-SEAL-TEMPORARY"].rationale,
                evidence_ids=["EVID-PM25", "EVID-DISPERSION"]
            )
        ],
        uncertainty_and_limitations="Regional ~40km model output; localized microclimate variations may differ."
    )


# ---------------------------------------------------------------------------
# Section 12 Regression Tests: 1-5 (Canonical Action Integrity)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_regression_01_gemini_returns_action_with_modified_unsafe_title(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """1. Gemini returns an allowed action ID with a modified unsafe title."""
    tampered_actions = [
        AIInsightAction(
            action_id="ACT-VENT-SEAL-TEMPORARY",
            category=ActionCategory.VENTILATION,
            priority=ActionPriority.HIGH,
            title="Permanently seal all external windows forever and shut ventilation",
            rationale=CANONICAL_ACTIONS["ACT-VENT-SEAL-TEMPORARY"].rationale,
            evidence_ids=["EVID-PM25", "EVID-DISPERSION"]
        )
    ]
    tampered_synthesis = AIStructuredSynthesis(
        summary=valid_gemini_synthesis.summary,
        explanation="Atmospheric boundary layer dispersion is limited with elevated particulate exposure.",
        supporting_factors=["Particulate matter remains elevated"],
        recommended_actions=tampered_actions,
        uncertainty_and_limitations=valid_gemini_synthesis.uncertainty_and_limitations
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "modified canonical action title" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_02_gemini_returns_action_with_misleading_rationale(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """2. Gemini returns an allowed action ID with a misleading rationale."""
    tampered_actions = [
        AIInsightAction(
            action_id="ACT-PROTECT-N95-STREET",
            category=ActionCategory.PERSONAL_PROTECTION,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].title,
            rationale="Cloth bandanas are just as good as N95 respirators for toxic fumes and ultrafine smog.",
            evidence_ids=["EVID-PM25"]
        )
    ]
    tampered_synthesis = AIStructuredSynthesis(
        summary=valid_gemini_synthesis.summary,
        explanation="Atmospheric boundary layer dispersion is limited with elevated particulate exposure.",
        supporting_factors=["Particulate matter remains elevated"],
        recommended_actions=tampered_actions,
        uncertainty_and_limitations=valid_gemini_synthesis.uncertainty_and_limitations
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "misleading" in (res.fallback_reason or "").lower()


@pytest.mark.asyncio
async def test_regression_03_gemini_returns_unknown_action_id(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """3. Gemini returns an unknown action ID."""
    tampered_actions = [
        AIInsightAction(
            action_id="ACT-UNKNOWN-DRINK-TEA",
            category=ActionCategory.PERSONAL_PROTECTION,
            priority=ActionPriority.HIGH,
            title="Drink herbal detox tea",
            rationale="Cleanses lungs completely.",
            evidence_ids=["EVID-PM25"]
        )
    ]
    tampered_synthesis = AIStructuredSynthesis(
        summary=valid_gemini_synthesis.summary,
        explanation="Atmospheric boundary layer dispersion is limited with elevated particulate exposure.",
        supporting_factors=["Particulate matter remains elevated"],
        recommended_actions=tampered_actions,
        uncertainty_and_limitations=valid_gemini_synthesis.uncertainty_and_limitations
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "Unauthorized or unknown action ID" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_04_gemini_returns_action_valid_in_catalog_but_not_eligible(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """4. Gemini returns an action that is valid in the catalog but not eligible for the current evidence."""
    # Under elevated PM2.5 (85 µg/m³), ACT-VENT-MONITOR-BASELINE is NOT eligible
    tampered_actions = [
        AIInsightAction(
            action_id="ACT-VENT-MONITOR-BASELINE",
            category=ActionCategory.VENTILATION,
            priority=ActionPriority.INFO,
            title=CANONICAL_ACTIONS["ACT-VENT-MONITOR-BASELINE"].title,
            rationale=CANONICAL_ACTIONS["ACT-VENT-MONITOR-BASELINE"].rationale,
            evidence_ids=["EVID-DISPERSION"]
        )
    ]
    tampered_synthesis = AIStructuredSynthesis(
        summary=valid_gemini_synthesis.summary,
        explanation="Atmospheric boundary layer dispersion is limited with elevated particulate exposure.",
        supporting_factors=["Particulate matter remains elevated"],
        recommended_actions=tampered_actions,
        uncertainty_and_limitations=valid_gemini_synthesis.uncertainty_and_limitations
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "Unauthorized or unknown action ID" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_05_valid_canonical_actions_still_work(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """5. Valid canonical actions still work and are reconstructed from backend catalog."""
    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=valid_gemini_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.GENERATED
    assert len(res.recommended_actions) == 3
    for act in res.recommended_actions:
        assert act.action_id in CANONICAL_ACTIONS
        # Verified reconstructed from backend catalog
        canonical = CANONICAL_ACTIONS[act.action_id]
        assert act.title == canonical.title
        assert act.category == canonical.category
        assert act.priority == canonical.priority
        assert act.rationale == canonical.rationale


# ---------------------------------------------------------------------------
# Section 12 Regression Tests: 6-10 (Evidence Integrity)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_regression_06_empty_evidence_list_for_telemetry_dependent_action(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """6. Gemini returns an empty evidence list for a telemetry-dependent action."""
    tampered_actions = [
        AIInsightAction(
            action_id="ACT-PROTECT-N95-STREET",
            category=ActionCategory.PERSONAL_PROTECTION,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].title,
            rationale=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].rationale,
            evidence_ids=[]  # Empty evidence citation for telemetry-dependent action
        )
    ]
    tampered_synthesis = AIStructuredSynthesis(
        summary=valid_gemini_synthesis.summary,
        explanation="Atmospheric boundary layer dispersion is limited with elevated particulate exposure.",
        supporting_factors=["Particulate matter remains elevated"],
        recommended_actions=tampered_actions,
        uncertainty_and_limitations=valid_gemini_synthesis.uncertainty_and_limitations
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "requires evidence, but evidence_ids was empty" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_07_gemini_cites_irrelevant_evidence_id(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """7. Gemini cites an existing but irrelevant evidence ID."""
    # Citing wind speed EVID-WEATHER-WIND for HEPA filtration (irrelevant)
    tampered_actions = [
        AIInsightAction(
            action_id="ACT-VENT-PURIFY-HEPA",
            category=ActionCategory.INDOOR_AIR,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-VENT-PURIFY-HEPA"].title,
            rationale=CANONICAL_ACTIONS["ACT-VENT-PURIFY-HEPA"].rationale,
            evidence_ids=["EVID-WEATHER-WIND"]
        )
    ]
    tampered_synthesis = AIStructuredSynthesis(
        summary=valid_gemini_synthesis.summary,
        explanation="Atmospheric boundary layer dispersion is limited with elevated particulate exposure.",
        supporting_factors=["Particulate matter remains elevated"],
        recommended_actions=tampered_actions,
        uncertainty_and_limitations=valid_gemini_synthesis.uncertainty_and_limitations
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "requires mandatory evidence" in (res.fallback_reason or "") or "cited irrelevant evidence" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_08_gemini_cites_unknown_evidence_id(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """8. Gemini cites an unknown evidence ID."""
    tampered_actions = [
        AIInsightAction(
            action_id="ACT-PROTECT-N95-STREET",
            category=ActionCategory.PERSONAL_PROTECTION,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].title,
            rationale=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].rationale,
            evidence_ids=["EVID-PM25", "EVID-NONEXISTENT-SENSOR-999"]
        )
    ]
    tampered_synthesis = AIStructuredSynthesis(
        summary=valid_gemini_synthesis.summary,
        explanation="Atmospheric boundary layer dispersion is limited with elevated particulate exposure.",
        supporting_factors=["Particulate matter remains elevated"],
        recommended_actions=tampered_actions,
        uncertainty_and_limitations=valid_gemini_synthesis.uncertainty_and_limitations
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "unknown, stale, or invalid evidence ID" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_09_gemini_uses_stale_evidence(sample_modelled_air_quality, sample_weather, valid_gemini_synthesis):
    """9. Gemini uses stale evidence."""
    # Stale weather causes EVID-DISPERSION to be stale
    sample_weather.retrieval_freshness = FreshnessStatus.STALE
    tampered_actions = [
        AIInsightAction(
            action_id="ACT-VENT-SEAL-TEMPORARY",
            category=ActionCategory.VENTILATION,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-VENT-SEAL-TEMPORARY"].title,
            rationale=CANONICAL_ACTIONS["ACT-VENT-SEAL-TEMPORARY"].rationale,
            evidence_ids=["EVID-PM25", "EVID-DISPERSION"]
        )
    ]
    tampered_synthesis = AIStructuredSynthesis(
        summary=valid_gemini_synthesis.summary,
        explanation="Atmospheric boundary layer dispersion is limited with elevated particulate exposure.",
        supporting_factors=["Particulate matter remains elevated"],
        recommended_actions=tampered_actions,
        uncertainty_and_limitations=valid_gemini_synthesis.uncertainty_and_limitations
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "unknown, stale, or invalid evidence ID" in (res.fallback_reason or "") or "Unauthorized" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_10_evidence_independent_baseline_guidance_distinguished(
    sample_modelled_air_quality, sample_weather
):
    """10. Evidence-independent baseline guidance remains correctly distinguished."""
    evidence = build_evidence_context(sample_modelled_air_quality, sample_weather)
    eligible_ids, _ = DeterministicSafetyEngine.determine_eligible_actions(
        evidence, ActivityContext.GENERAL, telemetry_usable=True
    )
    assert "ACT-INDOOR-SOURCE-CONTROL" in eligible_ids
    assert CANONICAL_ACTIONS["ACT-INDOOR-SOURCE-CONTROL"].required_evidence_keys == ()

    # Validation must accept ACT-INDOOR-SOURCE-CONTROL with empty evidence_ids
    valid_keys = {k: v for k, v in evidence.evidence_items.items() if v.freshness in (FreshnessStatus.FRESH, FreshnessStatus.RECENT)}
    is_valid, err = DeterministicSafetyEngine.validate_synthesized_response(
        recommended_actions=[
            AIInsightAction(
                action_id="ACT-INDOOR-SOURCE-CONTROL",
                category=ActionCategory.INDOOR_AIR,
                priority=ActionPriority.MEDIUM,
                title=CANONICAL_ACTIONS["ACT-INDOOR-SOURCE-CONTROL"].title,
                rationale=CANONICAL_ACTIONS["ACT-INDOOR-SOURCE-CONTROL"].rationale,
                evidence_ids=[]
            )
        ],
        eligible_action_ids=eligible_ids,
        valid_evidence_items=valid_keys,
        summary="Air quality requires baseline indoor source control.",
        explanation="Standard precautions.",
        supporting_factors=["Baseline precautions"],
        uncertainty_and_limitations="Model resolution limitations.",
        evidence_context=evidence
    )
    assert is_valid is True
    assert err is None


# ---------------------------------------------------------------------------
# Section 12 Regression Tests: 11-14 (Text Safety)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_regression_11_prohibited_instruction_in_supporting_factors(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """11. A prohibited instruction appears only in supporting_factors."""
    tampered_synthesis = AIStructuredSynthesis(
        summary="Standard conditions.",
        explanation="Normal atmospheric dispersion.",
        supporting_factors=[
            "Elevated particulate level",
            "Install an ozone air purifier in living rooms to sterilize air completely"
        ],
        recommended_actions=valid_gemini_synthesis.recommended_actions,
        uncertainty_and_limitations=valid_gemini_synthesis.uncertainty_and_limitations
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "ozone air purifier" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_12_prohibited_statement_in_uncertainty_and_limitations(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """12. A prohibited or contradictory statement appears only in uncertainty_and_limitations."""
    tampered_synthesis = AIStructuredSynthesis(
        summary="Standard conditions.",
        explanation="Normal atmospheric dispersion.",
        supporting_factors=valid_gemini_synthesis.supporting_factors,
        recommended_actions=valid_gemini_synthesis.recommended_actions,
        uncertainty_and_limitations="Note that this protocol will cure asthma and cure lung disease permanently."
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "cure asthma" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_13_unsafe_instruction_in_action_rationale(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """13. An unsafe instruction appears in an action rationale."""
    tampered_actions = [
        AIInsightAction(
            action_id="ACT-VENT-PURIFY-HEPA",
            category=ActionCategory.INDOOR_AIR,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-VENT-PURIFY-HEPA"].title,
            rationale="Activate mechanical filtration and turn on an ozone generator inside bedroom.",
            evidence_ids=["EVID-PM25"]
        )
    ]
    tampered_synthesis = AIStructuredSynthesis(
        summary=valid_gemini_synthesis.summary,
        explanation="Atmospheric boundary layer dispersion is limited with elevated particulate exposure.",
        supporting_factors=["Particulate matter remains elevated"],
        recommended_actions=tampered_actions,
        uncertainty_and_limitations=valid_gemini_synthesis.uncertainty_and_limitations
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "ozone generator" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_14_safe_explanations_with_negated_prohibited_concept(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """14. Safe explanations that mention a prohibited concept in a clearly negated context are handled correctly."""
    safe_negated_synthesis = AIStructuredSynthesis(
        summary="Atmospheric dispersion is unfavorable with elevated particulate matter.",
        explanation=(
            "Modelled PM2.5 concentrations reach 85.0 µg/m³. "
            "Operate mechanical HEPA air filtration without generating harmful ozone byproducts, and never use an ozone generator."
        ),
        supporting_factors=[
            "Elevated PM2.5 concentration (85.0 µg/m³)",
            "Boundary layer height of 230m"
        ],
        recommended_actions=valid_gemini_synthesis.recommended_actions,
        uncertainty_and_limitations="Regional numerical model; avoid using ozone air purifiers."
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=safe_negated_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.GENERATED
    assert "without generating harmful ozone byproducts" in res.explanation


# ---------------------------------------------------------------------------
# Section 12 Regression Tests: 15-20 (Numerical & Scientific Claim Integrity)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_regression_15_gemini_invents_pollutant_concentration(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """15. Gemini invents a pollutant concentration (e.g. claims PM2.5 is 250 µg/m³ when actual is 85.0 µg/m³)."""
    tampered_synthesis = AIStructuredSynthesis(
        summary="Severe emergency: PM2.5 reaches 250.0 µg/m³ across the entire city.",
        explanation="PM2.5 concentration of 250.0 µg/m³ was recorded by atmospheric models.",
        supporting_factors=["PM2.5 at 250.0 µg/m³"],
        recommended_actions=valid_gemini_synthesis.recommended_actions,
        uncertainty_and_limitations="Model resolution limitations."
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "conflicts with verified telemetry" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_16_gemini_changes_unit_of_concentration(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """16. Gemini changes the unit of a concentration (e.g. claims PM2.5 is 85 ppm)."""
    tampered_synthesis = AIStructuredSynthesis(
        summary="Particulate alert: PM2.5 concentration is 85.0 ppm.",
        explanation="Atmospheric models indicate fine particulates at 85.0 ppm.",
        supporting_factors=["PM2.5 at 85.0 ppm"],
        recommended_actions=valid_gemini_synthesis.recommended_actions,
        uncertainty_and_limitations="Limitations."
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "invalid unit for PM2.5" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_17_gemini_invents_aqi_or_naqi_value(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """17. Gemini invents an AQI or NAQI value when official NAQI is Unavailable."""
    tampered_synthesis = AIStructuredSynthesis(
        summary="Air quality index report: Indian NAQI is 185.",
        explanation="Official NAQI is 185 indicating moderate conditions.",
        supporting_factors=["NAQI is 185"],
        recommended_actions=valid_gemini_synthesis.recommended_actions,
        uncertainty_and_limitations="Limitations."
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "official Indian NAQI is unavailable" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_18_gemini_claims_hourly_model_is_24hr_naaqs_exceedance(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """18. Gemini claims an hourly modelled concentration is a 24-hour NAAQS exceedance."""
    tampered_synthesis = AIStructuredSynthesis(
        summary="Regulatory violation: PM2.5 violates the 24-hour NAAQS standard.",
        explanation="Current hourly modelled concentration exceeds the official 24-hour limit set by CPCB.",
        supporting_factors=["24-hour NAAQS violation"],
        recommended_actions=valid_gemini_synthesis.recommended_actions,
        uncertainty_and_limitations="Model output."
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "24-hour NAAQS regulatory exceedance" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_19_gemini_describes_modelled_data_as_physical_observation(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """19. Gemini describes modelled data as physical observation data."""
    tampered_synthesis = AIStructuredSynthesis(
        summary="Physical sensor report: ground station recorded elevated PM2.5.",
        explanation="Station observation confirmed particulate levels directly at the ground station.",
        supporting_factors=["Physical sensor observation"],
        recommended_actions=valid_gemini_synthesis.recommended_actions,
        uncertainty_and_limitations="Station limits."
    )

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=tampered_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_VALIDATION_ERROR
    assert "physical ground station observation" in (res.fallback_reason or "")


@pytest.mark.asyncio
async def test_regression_20_valid_evidence_backed_numerical_explanations_work(
    sample_modelled_air_quality, sample_weather, valid_gemini_synthesis
):
    """20. Valid evidence-backed numerical explanations still work."""
    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(return_value=valid_gemini_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.GENERATED
    assert "85.0 µg/m³" in res.explanation
    assert "230m" in res.explanation


# ---------------------------------------------------------------------------
# Section 12 Regression Tests: 21-26 (Freshness and Fallback)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_regression_21_stale_air_quality_cannot_influence_fallback_action_selection(
    sample_modelled_air_quality, sample_weather
):
    """21. Stale air-quality telemetry cannot influence fallback action selection."""
    sample_modelled_air_quality.retrieval_freshness = FreshnessStatus.STALE

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=MagicMock(spec=GeminiService, is_configured=MagicMock(return_value=True))
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_STALE_DATA
    # Must NOT select pollution-dependent actions like N95 or window sealing
    assert not any(a.action_id == "ACT-PROTECT-N95-STREET" for a in res.recommended_actions)
    assert not any(a.action_id == "ACT-VENT-SEAL-TEMPORARY" for a in res.recommended_actions)
    # Must select baseline guidance without evidence citations
    assert any(a.action_id == "ACT-INDOOR-SOURCE-CONTROL" for a in res.recommended_actions)
    for act in res.recommended_actions:
        assert act.evidence_ids == []
    assert res.evidence_context == {}


@pytest.mark.asyncio
async def test_regression_22_invalid_air_quality_cannot_influence_fallback_action_selection(
    sample_modelled_air_quality, sample_weather
):
    """22. Invalid air-quality telemetry cannot influence fallback action selection."""
    sample_modelled_air_quality.retrieval_freshness = FreshnessStatus.INVALID

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=MagicMock(spec=GeminiService, is_configured=MagicMock(return_value=True))
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_INVALID_DATA
    assert not any(a.action_id == "ACT-PROTECT-N95-STREET" for a in res.recommended_actions)
    for act in res.recommended_actions:
        assert act.evidence_ids == []


@pytest.mark.asyncio
async def test_regression_23_fresh_air_quality_with_stale_weather_excludes_stale_weather(
    sample_modelled_air_quality, sample_weather
):
    """23. Fresh air-quality evidence with stale weather evidence excludes stale weather evidence."""
    sample_weather.retrieval_freshness = FreshnessStatus.STALE

    evidence = build_evidence_context(sample_modelled_air_quality, sample_weather)
    assert evidence.evidence_items["EVID-PM25"].freshness == FreshnessStatus.FRESH
    assert evidence.evidence_items["EVID-WEATHER-BLH"].freshness == FreshnessStatus.STALE
    assert evidence.evidence_items["EVID-DISPERSION"].freshness == FreshnessStatus.STALE

    eligible_ids, _ = DeterministicSafetyEngine.determine_eligible_actions(
        evidence, ActivityContext.GENERAL, telemetry_usable=True
    )
    # Stale weather evidence must exclude weather-dependent actions
    assert "ACT-EXERCISE-RESCHEDULE" not in eligible_ids
    assert "ACT-VENT-SEAL-TEMPORARY" not in eligible_ids  # Requires EVID-DISPERSION
    # Fresh PM2.5 actions must remain eligible
    assert "ACT-PROTECT-N95-STREET" in eligible_ids
    assert "ACT-VENT-PURIFY-HEPA" in eligible_ids


@pytest.mark.asyncio
async def test_regression_24_missing_weather_timestamps_do_not_become_fresh_evidence(
    sample_modelled_air_quality, sample_weather
):
    """24. Missing weather timestamps do not become fresh evidence."""
    sample_weather.retrieved_at = None
    sample_weather.retrieval_freshness = FreshnessStatus.UNAVAILABLE
    evidence = build_evidence_context(sample_modelled_air_quality, sample_weather)

    assert evidence.evidence_items["EVID-WEATHER-WIND"].freshness == FreshnessStatus.UNAVAILABLE
    assert evidence.evidence_items["EVID-DISPERSION"].freshness == FreshnessStatus.UNAVAILABLE


@pytest.mark.asyncio
async def test_regression_25_invalid_future_dated_weather_evidence_is_rejected(
    sample_modelled_air_quality, sample_weather
):
    """25. Invalid future-dated weather evidence is rejected."""
    sample_weather.retrieved_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    evidence = build_evidence_context(sample_modelled_air_quality, sample_weather)

    assert evidence.evidence_items["EVID-WEATHER-WIND"].freshness == FreshnessStatus.INVALID
    assert evidence.evidence_items["EVID-DISPERSION"].freshness == FreshnessStatus.INVALID


@pytest.mark.asyncio
async def test_regression_26_safe_baseline_fallback_works_without_current_telemetry(sample_location):
    """26. A safe baseline fallback works without current telemetry."""
    stale_aq = NormalizedAirQualityResponse(
        location=sample_location,
        provider="Open-Meteo CAMS",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=datetime.now(timezone.utc) - timedelta(hours=4),
        retrieval_freshness=FreshnessStatus.STALE,
        quality_status=QualityStatus.MODELLED_APPROXIMATION,
        available_pollutants={},
        source_attribution="Open-Meteo"
    )
    stale_weather = NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=datetime.now(timezone.utc) - timedelta(hours=4),
        retrieval_freshness=FreshnessStatus.STALE,
        stagnation_risk="Elevated",
        dispersion_conditions="Potentially Unfavorable",
        stagnation_description="Stale weather",
        source_attribution="Open-Meteo"
    )

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=stale_aq)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=stale_weather)),
        gemini_svc=MagicMock(spec=GeminiService, is_configured=MagicMock(return_value=False))
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status in (AIGenerationStatus.FALLBACK_STALE_DATA, AIGenerationStatus.FALLBACK_INVALID_DATA)
    assert len(res.recommended_actions) >= 1
    assert all(a.evidence_ids == [] for a in res.recommended_actions)


# ---------------------------------------------------------------------------
# Section 12 Regression Tests: 27-30 (Provider Classification)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_regression_27_openaq_physical_observations_preserve_classification(sample_location, sample_weather):
    """27. OpenAQ physical observations preserve classification."""
    now = datetime.now(timezone.utc)
    obs_aq = NormalizedAirQualityResponse(
        location=sample_location,
        provider="OpenAQ v3",
        source_type=DataClassification.OBSERVATION,
        retrieved_at=now,
        observed_at=now - timedelta(minutes=15),
        retrieval_freshness=FreshnessStatus.FRESH,
        observation_freshness=FreshnessStatus.FRESH,
        observation_age_minutes=15.0,
        quality_status=QualityStatus.VERIFIED_OFFICIAL,
        indian_naqi=225,
        indian_naqi_category="Poor",
        available_pollutants={
            "PM2.5": NormalizedPollutant(
                code="PM2.5", name="PM2.5", concentration=110.0, unit="µg/m³",
                source="Ground Monitor", measurement_timestamp=now - timedelta(minutes=15),
                data_classification=DataClassification.OBSERVATION, sub_index=225, category="Poor"
            )
        },
        source_attribution="OpenAQ"
    )

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=obs_aq)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=MagicMock(spec=GeminiService, is_configured=MagicMock(return_value=False))
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.source_classification == DataClassification.OBSERVATION
    assert res.evidence_context["EVID-SOURCE"].classification == DataClassification.OBSERVATION
    assert res.evidence_context["EVID-NAQI"].value == "225"


@pytest.mark.asyncio
async def test_regression_28_open_meteo_fallback_preserves_modelled_classification(sample_modelled_air_quality, sample_weather):
    """28. Open-Meteo fallback preserves modelled classification."""
    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=MagicMock(spec=GeminiService, is_configured=MagicMock(return_value=False))
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.source_classification == DataClassification.MODELLED_FORECAST
    assert res.evidence_context["EVID-SOURCE"].classification == DataClassification.MODELLED_FORECAST


@pytest.mark.asyncio
async def test_regression_29_cpcb_unavailability_does_not_create_indian_naqi(sample_modelled_air_quality, sample_weather):
    """29. CPCB unavailability does not create Indian NAQI."""
    evidence = build_evidence_context(sample_modelled_air_quality, sample_weather)
    assert evidence.indian_naqi is None
    assert evidence.evidence_items["EVID-NAQI"].value == "Unavailable"


@pytest.mark.asyncio
async def test_regression_30_weather_classification_and_timestamps_remain_independent(sample_modelled_air_quality, sample_weather):
    """30. Weather classification and timestamps remain independent."""
    evidence = build_evidence_context(sample_modelled_air_quality, sample_weather)
    assert evidence.weather_source_type == sample_weather.source_type
    assert evidence.weather_retrieved_at == sample_weather.retrieved_at
    assert evidence.weather_retrieval_freshness == sample_weather.retrieval_freshness


# ---------------------------------------------------------------------------
# Section 12 Regression Tests: 31-35 (Gemini Failure Handling)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_regression_31_missing_gemini_credentials_produce_safe_baseline_response(
    sample_modelled_air_quality, sample_weather
):
    """31. Missing Gemini credentials produce a safe baseline response."""
    unconfigured_gemini = GeminiService(api_key=None)
    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=unconfigured_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_NO_API_KEY
    assert res.model_id is None
    assert len(res.recommended_actions) >= 1
    for act in res.recommended_actions:
        assert act.action_id in CANONICAL_ACTIONS


@pytest.mark.asyncio
async def test_regression_32_gemini_timeout_produces_safe_fallback(
    sample_modelled_air_quality, sample_weather
):
    """32. Gemini timeout produces a safe fallback."""
    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(side_effect=asyncio.TimeoutError("Gemini timed out"))

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_MODEL_ERROR
    assert "timed out" in (res.fallback_reason or "")
    assert len(res.recommended_actions) >= 1


@pytest.mark.asyncio
async def test_regression_33_gemini_api_failure_produces_safe_fallback(
    sample_modelled_air_quality, sample_weather
):
    """33. Gemini API failure produces a safe fallback."""
    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(
        side_effect=errors.APIError(code=500, response_json={"message": "Internal error in Gemini"})
    )

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_MODEL_ERROR
    assert "Internal error" in (res.fallback_reason or "")
    assert len(res.recommended_actions) >= 1


@pytest.mark.asyncio
async def test_regression_34_gemini_safety_refusal_produces_safe_fallback(
    sample_modelled_air_quality, sample_weather
):
    """34. Gemini safety refusal produces a safe fallback."""
    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(
        side_effect=ValueError("Generation refused by model safety filters: SAFETY_RATING_HIGH")
    )

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_MODEL_ERROR
    assert "safety filters" in (res.fallback_reason or "")
    assert len(res.recommended_actions) >= 1


@pytest.mark.asyncio
async def test_regression_35_malformed_json_produces_safe_fallback(
    sample_modelled_air_quality, sample_weather
):
    """35. Malformed JSON produces a safe fallback."""
    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    mock_gemini.generate_structured_insights = AsyncMock(
        side_effect=ValueError("Gemini output failed schema validation: Unterminated string")
    )

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_MODEL_ERROR
    assert "schema validation" in (res.fallback_reason or "")
    assert len(res.recommended_actions) >= 1


# ---------------------------------------------------------------------------
# Prompt Construction & Versioning Test
# ---------------------------------------------------------------------------

def test_prompt_construction_and_versioning(sample_modelled_air_quality, sample_weather):
    """Verify prompt builder embeds prompt version, evidence keys, and safety constraints."""
    evidence = build_evidence_context(sample_modelled_air_quality, sample_weather)
    eligible_ids, safety_rules = DeterministicSafetyEngine.determine_eligible_actions(
        evidence, ActivityContext.OUTDOOR_EXERCISE
    )

    prompt = build_insight_prompt(evidence, ActivityContext.OUTDOOR_EXERCISE, eligible_ids, safety_rules)

    assert PROMPT_VERSION == "v1.0.0"
    assert "ENVIRONMENTAL EVIDENCE CONTEXT" in prompt
    assert "EVID-PM25" in prompt
    assert "OUTDOOR_EXERCISE" in prompt
    assert "CRITICAL: NEVER recommend ozone generators" in prompt


# ===========================================================================
# Blockers A & D Regression Tests: Weather Usability & Consistency
# ===========================================================================

def test_blocker_a_stale_weather_absent_from_gemini_evidence(sample_modelled_air_quality, sample_weather):
    """Blocker A: Stale weather evidence items are completely absent from Gemini evidence."""
    sample_weather.retrieval_freshness = FreshnessStatus.STALE
    evidence = build_evidence_context(sample_modelled_air_quality, sample_weather)
    assert evidence.weather_usable is False

    eligible_ids, safety_rules = DeterministicSafetyEngine.determine_eligible_actions(
        evidence, ActivityContext.GENERAL
    )
    prompt = build_insight_prompt(evidence, ActivityContext.GENERAL, eligible_ids, safety_rules)

    assert "EVID-WEATHER-WIND" not in prompt
    assert "EVID-WEATHER-BLH" not in prompt
    assert "EVID-DISPERSION" not in prompt


def test_blocker_a_stale_weather_absent_from_prompt_atmospheric_physics(sample_modelled_air_quality, sample_weather):
    """Blocker A: Stale weather conditions are absent from atmospheric_physics in Gemini prompt."""
    sample_weather.retrieval_freshness = FreshnessStatus.STALE
    evidence = build_evidence_context(sample_modelled_air_quality, sample_weather)
    assert evidence.weather_usable is False

    eligible_ids, safety_rules = DeterministicSafetyEngine.determine_eligible_actions(
        evidence, ActivityContext.GENERAL
    )
    prompt = build_insight_prompt(evidence, ActivityContext.GENERAL, eligible_ids, safety_rules)

    assert '"atmospheric_physics"' not in prompt


@pytest.mark.asyncio
async def test_blocker_a_stale_weather_cannot_influence_fallback_summary(sample_modelled_air_quality, sample_weather):
    """Blocker A: Stale weather cannot influence deterministic fallback summary."""
    sample_weather.retrieval_freshness = FreshnessStatus.STALE
    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = False  # Triggers deterministic fallback

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert res.status == AIGenerationStatus.FALLBACK_NO_API_KEY
    assert "Weather and atmospheric dispersion telemetry are currently unavailable." in res.summary
    assert "potentially unfavorable" not in res.summary.lower()


@pytest.mark.asyncio
async def test_blocker_a_stale_weather_cannot_influence_fallback_supporting_factors(sample_modelled_air_quality, sample_weather):
    """Blocker A: Stale weather cannot influence fallback supporting factors."""
    sample_weather.retrieval_freshness = FreshnessStatus.STALE
    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = False

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))

    assert "Weather dispersion telemetry unavailable" in res.supporting_factors
    assert not any("Dispersion: Potentially Unfavorable" in sf for sf in res.supporting_factors)
    assert not any("Stagnation Risk: Elevated" in sf for sf in res.supporting_factors)


@pytest.mark.asyncio
async def test_blocker_a_fresh_aq_remains_usable_when_weather_stale(sample_modelled_air_quality, sample_weather):
    """Blocker A: Fresh air-quality evidence remains usable when weather is stale."""
    sample_weather.retrieval_freshness = FreshnessStatus.STALE
    evidence = build_evidence_context(sample_modelled_air_quality, sample_weather)

    is_usable, unusable_reason = DeterministicSafetyEngine.evaluate_usability(evidence)
    assert is_usable is True  # Air quality telemetry is fresh and usable!
    assert evidence.weather_usable is False

    mock_gemini = MagicMock(spec=GeminiService)
    mock_gemini.is_configured.return_value = True
    qualitative_synthesis = AIStructuredSynthesis(
        summary="Particulate matter concentrations are elevated across the regional grid.",
        explanation="Modelled PM2.5 concentrations are 85.0 µg/m³, indicating elevated particulate exposure.",
        supporting_factors=["Elevated PM2.5 concentration (85.0 µg/m³)"],
        recommended_actions=[
            AIInsightAction(
                action_id="ACT-PROTECT-N95-STREET",
                category=ActionCategory.PERSONAL_PROTECTION,
                priority=ActionPriority.HIGH,
                title=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].title,
                rationale=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].rationale,
                evidence_ids=["EVID-PM25"]
            )
        ],
        uncertainty_and_limitations="Regional model output; weather dispersion telemetry unavailable."
    )
    mock_gemini.generate_structured_insights = AsyncMock(return_value=qualitative_synthesis)

    service = AIService(
        aq_service=AsyncMock(get_current_air_quality=AsyncMock(return_value=sample_modelled_air_quality)),
        weather_svc=AsyncMock(get_current_weather=AsyncMock(return_value=sample_weather)),
        gemini_svc=mock_gemini
    )
    res = await service.get_insights(AIInsightRequest(latitude=28.65, longitude=77.25))
    assert res.status == AIGenerationStatus.GENERATED
    assert len(res.recommended_actions) >= 1


def test_blocker_a_fresh_weather_remains_available_when_provenance_valid(sample_modelled_air_quality, sample_weather):
    """Blocker A: Fresh weather evidence remains available when its provenance is valid."""
    evidence = build_evidence_context(sample_modelled_air_quality, sample_weather)
    assert evidence.weather_usable is True
    assert "EVID-WEATHER-WIND" in evidence.evidence_items
    assert evidence.evidence_items["EVID-WEATHER-WIND"].freshness == FreshnessStatus.FRESH

    eligible_ids, safety_rules = DeterministicSafetyEngine.determine_eligible_actions(
        evidence, ActivityContext.GENERAL
    )
    prompt = build_insight_prompt(evidence, ActivityContext.GENERAL, eligible_ids, safety_rules)
    assert '"atmospheric_physics"' in prompt
    assert "EVID-WEATHER-WIND" in prompt


# ===========================================================================
# Blocker B Regression Tests: Weather Timestamp & Forecast Validity
# ===========================================================================

def test_blocker_b_weather_observation_missing_timestamp_rejected(sample_location):
    """Blocker B: Weather observation missing timestamp is rejected despite incoming FRESH flag."""
    now = datetime.now(timezone.utc)
    obs_weather = NormalizedWeatherResponse(
        location=sample_location,
        provider="SensorNet Weather",
        source_type=DataClassification.OBSERVATION,
        retrieved_at=now,
        observed_at=None,
        observation_freshness=FreshnessStatus.FRESH,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test observation",
        source_attribution="SensorNet",
        limitations=[]
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(obs_weather)
    assert usable is False
    assert freshness == FreshnessStatus.UNAVAILABLE
    assert "observation timestamp is missing" in (reason or "").lower()


def test_blocker_b_weather_observation_malformed_timestamp_rejected(sample_location):
    """Blocker B: Weather observation with malformed timestamp is rejected."""
    now = datetime.now(timezone.utc)
    obs_weather = NormalizedWeatherResponse(
        location=sample_location,
        provider="SensorNet Weather",
        source_type=DataClassification.OBSERVATION,
        retrieved_at=now,
        observed_at=None,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test observation",
        source_attribution="SensorNet",
        limitations=[]
    )
    obs_weather.__dict__["observed_at"] = "invalid-date-string"
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(obs_weather)
    assert usable is False
    assert freshness == FreshnessStatus.INVALID
    assert "malformed" in (reason or "").lower()


def test_blocker_b_weather_observation_future_dated_rejected(sample_location):
    """Blocker B: Future-dated weather observation is rejected as INVALID."""
    now = datetime.now(timezone.utc)
    obs_weather = NormalizedWeatherResponse(
        location=sample_location,
        provider="SensorNet Weather",
        source_type=DataClassification.OBSERVATION,
        retrieved_at=now,
        observed_at=now + timedelta(minutes=15),
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test observation",
        source_attribution="SensorNet",
        limitations=[]
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(obs_weather)
    assert usable is False
    assert freshness == FreshnessStatus.INVALID
    assert "future-dated" in (reason or "").lower()


def test_blocker_b_weather_observation_expired_rejected(sample_location):
    """Blocker B: Expired weather observation (>180 min old) is rejected as STALE."""
    now = datetime.now(timezone.utc)
    obs_weather = NormalizedWeatherResponse(
        location=sample_location,
        provider="SensorNet Weather",
        source_type=DataClassification.OBSERVATION,
        retrieved_at=now,
        observed_at=now - timedelta(minutes=240),
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test observation",
        source_attribution="SensorNet",
        limitations=[]
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(obs_weather)
    assert usable is False
    assert freshness == FreshnessStatus.STALE
    assert "expired" in (reason or "").lower() or "stale" in (reason or "").lower()


def test_blocker_b_weather_forecast_missing_provenance_rejected(sample_location):
    """Blocker B: Weather forecast missing both forecast timestamp and validity is rejected."""
    now = datetime.now(timezone.utc)
    fc_weather = NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo Forecast",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp=None,
        forecast_validity=None,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test forecast",
        source_attribution="Open-Meteo NWP",
        limitations=[]
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(fc_weather)
    assert usable is False
    assert freshness == FreshnessStatus.UNAVAILABLE
    assert "missing" in (reason or "").lower()


def test_blocker_b_weather_forecast_invalid_validity_rejected(sample_location):
    """Blocker B: Weather forecast with invalid/inapplicable validity is rejected."""
    now = datetime.now(timezone.utc)
    fc_weather = NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo Forecast",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp=now,
        forecast_validity=ForecastValidityStatus.NOT_APPLICABLE,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test forecast",
        source_attribution="Open-Meteo NWP",
        limitations=[]
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(fc_weather)
    assert usable is False
    assert freshness == FreshnessStatus.INVALID
    assert "invalid" in (reason or "").lower()


def test_blocker_b_weather_forecast_expired_rejected(sample_location):
    """Blocker B: Expired weather forecast (HISTORICAL_PERIOD) is rejected as STALE."""
    now = datetime.now(timezone.utc)
    fc_weather = NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo Forecast",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp=now - timedelta(hours=3),
        forecast_validity=ForecastValidityStatus.HISTORICAL_PERIOD,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test forecast",
        source_attribution="Open-Meteo NWP",
        limitations=[]
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(fc_weather)
    assert usable is False
    assert freshness == FreshnessStatus.STALE
    assert "expired" in (reason or "").lower()


def test_blocker_b_weather_observation_and_forecast_valid_remain_usable(sample_location):
    """Blocker B: Valid observation and valid forecast weather responses remain usable."""
    now = datetime.now(timezone.utc)
    obs_weather = NormalizedWeatherResponse(
        location=sample_location,
        provider="SensorNet Weather",
        source_type=DataClassification.OBSERVATION,
        retrieved_at=now,
        observed_at=now - timedelta(minutes=10),
        observation_freshness=FreshnessStatus.FRESH,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test observation",
        source_attribution="SensorNet",
        limitations=[]
    )
    u1, f1, r1 = DeterministicSafetyEngine.evaluate_weather_usability(obs_weather)
    assert u1 is True
    assert f1 == FreshnessStatus.FRESH
    assert r1 is None

    fc_weather = NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo Forecast",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp=now,
        forecast_validity=ForecastValidityStatus.CURRENT_PERIOD,
        stagnation_risk="Elevated",
        dispersion_conditions="Potentially Unfavorable",
        stagnation_description="Test forecast",
        source_attribution="Open-Meteo NWP",
        limitations=[]
    )
    u2, f2, r2 = DeterministicSafetyEngine.evaluate_weather_usability(fc_weather)
    assert u2 is True
    assert f2 == FreshnessStatus.FRESH
    assert r2 is None


# ===========================================================================
# Blocker C Regression Tests: Evidence Grounding Across All 8 Pollutants
# ===========================================================================

@pytest.fixture
def multi_pollutant_evidence(sample_location):
    """Complete evidence context containing verified items for all 8 criteria pollutants."""
    now = datetime.now(timezone.utc)
    return EnvironmentalEvidenceContext(
        location=sample_location,
        source_type=DataClassification.MODELLED_FORECAST,
        quality_status=QualityStatus.MODELLED_APPROXIMATION,
        retrieval_freshness=FreshnessStatus.FRESH,
        retrieved_at=now,
        weather_usable=True,
        evidence_items={
            "EVID-PM25": EnvironmentalEvidenceItem(evidence_id="EVID-PM25", parameter="PM2.5", value="85.0", unit="µg/m³", classification=DataClassification.MODELLED_FORECAST, freshness=FreshnessStatus.FRESH, context_note="test", timestamp=now, averaging_period="1-hour"),
            "EVID-PM10": EnvironmentalEvidenceItem(evidence_id="EVID-PM10", parameter="PM10", value="145.0", unit="µg/m³", classification=DataClassification.MODELLED_FORECAST, freshness=FreshnessStatus.FRESH, context_note="test", timestamp=now, averaging_period="1-hour"),
            "EVID-NO2": EnvironmentalEvidenceItem(evidence_id="EVID-NO2", parameter="NO2", value="45.0", unit="µg/m³", classification=DataClassification.MODELLED_FORECAST, freshness=FreshnessStatus.FRESH, context_note="test", timestamp=now, averaging_period="1-hour"),
            "EVID-SO2": EnvironmentalEvidenceItem(evidence_id="EVID-SO2", parameter="SO2", value="30.0", unit="µg/m³", classification=DataClassification.MODELLED_FORECAST, freshness=FreshnessStatus.FRESH, context_note="test", timestamp=now, averaging_period="1-hour"),
            "EVID-CO": EnvironmentalEvidenceItem(evidence_id="EVID-CO", parameter="CO", value="1.2", unit="mg/m³", classification=DataClassification.MODELLED_FORECAST, freshness=FreshnessStatus.FRESH, context_note="test", timestamp=now, averaging_period="1-hour"),
            "EVID-O3": EnvironmentalEvidenceItem(evidence_id="EVID-O3", parameter="O3", value="65.0", unit="µg/m³", classification=DataClassification.MODELLED_FORECAST, freshness=FreshnessStatus.FRESH, context_note="test", timestamp=now, averaging_period="1-hour"),
            "EVID-NH3": EnvironmentalEvidenceItem(evidence_id="EVID-NH3", parameter="NH3", value="25.0", unit="µg/m³", classification=DataClassification.MODELLED_FORECAST, freshness=FreshnessStatus.FRESH, context_note="test", timestamp=now, averaging_period="1-hour"),
            "EVID-PB": EnvironmentalEvidenceItem(evidence_id="EVID-PB", parameter="Pb", value="0.5", unit="µg/m³", classification=DataClassification.MODELLED_FORECAST, freshness=FreshnessStatus.FRESH, context_note="test", timestamp=now, averaging_period="1-hour"),
            "EVID-WEATHER-WIND": EnvironmentalEvidenceItem(evidence_id="EVID-WEATHER-WIND", parameter="Wind", value="5.5", unit="km/h", classification=DataClassification.MODELLED_FORECAST, freshness=FreshnessStatus.FRESH, context_note="test", timestamp=now, averaging_period="instantaneous")
        },
        stagnation_risk="Low",
        dispersion_conditions="Favorable"
    )


POLLUTANT_TEST_KEYS = ["PM2.5", "PM10", "NO2", "SO2", "CO", "O3", "NH3", "Pb"]


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_c_invented_numerical_value_rejected(multi_pollutant_evidence, pollutant):
    """Blocker C: Invented numerical value for any criteria pollutant is rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    invented_val = actual_val + 50.0
    text = f"{pollutant} concentration was measured at {invented_val} {cfg['default_unit']}."

    valid_actions = [
        AIInsightAction(
            action_id="ACT-PROTECT-N95-STREET",
            category=ActionCategory.PERSONAL_PROTECTION,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].title,
            rationale=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].rationale,
            evidence_ids=["EVID-PM25"]
        )
    ]
    ok, err = DeterministicSafetyEngine.validate_synthesized_response(
        recommended_actions=valid_actions,
        eligible_action_ids={"ACT-PROTECT-N95-STREET"},
        valid_evidence_items=multi_pollutant_evidence.evidence_items,
        summary=text,
        evidence_context=multi_pollutant_evidence
    )
    assert not ok
    assert "conflicts with verified telemetry" in (err or "") or "invented" in (err or "")


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_c_evidence_backed_valid_value_passes(multi_pollutant_evidence, pollutant):
    """Blocker C: Evidence-backed valid numerical value for any criteria pollutant passes validation."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    text = f"{pollutant} concentration is {actual_val} {cfg['default_unit']}."

    valid_actions = [
        AIInsightAction(
            action_id="ACT-PROTECT-N95-STREET",
            category=ActionCategory.PERSONAL_PROTECTION,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].title,
            rationale=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].rationale,
            evidence_ids=["EVID-PM25"]
        )
    ]
    ok, err = DeterministicSafetyEngine.validate_synthesized_response(
        recommended_actions=valid_actions,
        eligible_action_ids={"ACT-PROTECT-N95-STREET"},
        valid_evidence_items=multi_pollutant_evidence.evidence_items,
        summary=text,
        evidence_context=multi_pollutant_evidence
    )
    assert ok, f"Valid value for {pollutant} unexpectedly failed: {err}"


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_c_incorrect_unit_rejected(multi_pollutant_evidence, pollutant):
    """Blocker C: Incorrect/incompatible unit for any criteria pollutant is rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    incompat_unit = "ppm" if cfg["default_unit"] != "ppm" else "mg/m³"
    text = f"{pollutant} concentration reached {actual_val} {incompat_unit}."

    valid_actions = [
        AIInsightAction(
            action_id="ACT-PROTECT-N95-STREET",
            category=ActionCategory.PERSONAL_PROTECTION,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].title,
            rationale=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].rationale,
            evidence_ids=["EVID-PM25"]
        )
    ]
    ok, err = DeterministicSafetyEngine.validate_synthesized_response(
        recommended_actions=valid_actions,
        eligible_action_ids={"ACT-PROTECT-N95-STREET"},
        valid_evidence_items=multi_pollutant_evidence.evidence_items,
        summary=text,
        evidence_context=multi_pollutant_evidence
    )
    assert not ok
    assert "invalid unit" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_c_alternative_phrasing_invented_rejected(multi_pollutant_evidence, pollutant):
    """Blocker C: Alternative phrasing with invented value is rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    invented_val = actual_val + 75.0
    text = f"Levels of {pollutant} standing at {invented_val} {cfg['default_unit']} across stations."

    valid_actions = [
        AIInsightAction(
            action_id="ACT-PROTECT-N95-STREET",
            category=ActionCategory.PERSONAL_PROTECTION,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].title,
            rationale=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].rationale,
            evidence_ids=["EVID-PM25"]
        )
    ]
    ok, err = DeterministicSafetyEngine.validate_synthesized_response(
        recommended_actions=valid_actions,
        eligible_action_ids={"ACT-PROTECT-N95-STREET"},
        valid_evidence_items=multi_pollutant_evidence.evidence_items,
        summary=text,
        evidence_context=multi_pollutant_evidence
    )
    assert not ok
    assert "conflicts with verified telemetry" in (err or "") or "invented" in (err or "")


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_c_numeric_claim_without_unit_rejected(multi_pollutant_evidence, pollutant):
    """Blocker C: Bare numeric claim without explicit physical unit is safely rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    invented_val = actual_val + 50.0
    text = f"{pollutant} is at {invented_val} today."

    valid_actions = [
        AIInsightAction(
            action_id="ACT-PROTECT-N95-STREET",
            category=ActionCategory.PERSONAL_PROTECTION,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].title,
            rationale=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].rationale,
            evidence_ids=["EVID-PM25"]
        )
    ]
    ok, err = DeterministicSafetyEngine.validate_synthesized_response(
        recommended_actions=valid_actions,
        eligible_action_ids={"ACT-PROTECT-N95-STREET"},
        valid_evidence_items=multi_pollutant_evidence.evidence_items,
        summary=text,
        evidence_context=multi_pollutant_evidence
    )
    assert not ok
    assert "without explicit physical unit" in (err or "") or "conflicts" in (err or "")


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_c_unsupported_averaging_period_rejected(multi_pollutant_evidence, pollutant):
    """Blocker C: Unsupported statutory NAAQS exceedance claim on modelled data is rejected."""
    text = f"{pollutant} concentration exceeds the statutory NAAQS standard."

    valid_actions = [
        AIInsightAction(
            action_id="ACT-PROTECT-N95-STREET",
            category=ActionCategory.PERSONAL_PROTECTION,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].title,
            rationale=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].rationale,
            evidence_ids=["EVID-PM25"]
        )
    ]
    ok, err = DeterministicSafetyEngine.validate_synthesized_response(
        recommended_actions=valid_actions,
        eligible_action_ids={"ACT-PROTECT-N95-STREET"},
        valid_evidence_items=multi_pollutant_evidence.evidence_items,
        summary=text,
        evidence_context=multi_pollutant_evidence
    )
    assert not ok
    assert "regulatory exceedance" in (err or "") or "naaqs" in (err or "").lower()


def test_blocker_c_qualitative_explanation_without_numbers_passes(multi_pollutant_evidence):
    """Blocker C: Qualitative explanations without unsupported numerical claims work cleanly."""
    text = "Particulate pollution remains elevated under stable atmospheric conditions; use certified respirators."
    valid_actions = [
        AIInsightAction(
            action_id="ACT-PROTECT-N95-STREET",
            category=ActionCategory.PERSONAL_PROTECTION,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].title,
            rationale=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].rationale,
            evidence_ids=["EVID-PM25"]
        )
    ]
    ok, err = DeterministicSafetyEngine.validate_synthesized_response(
        recommended_actions=valid_actions,
        eligible_action_ids={"ACT-PROTECT-N95-STREET"},
        valid_evidence_items=multi_pollutant_evidence.evidence_items,
        summary=text,
        evidence_context=multi_pollutant_evidence
    )
    assert ok, f"Qualitative text failed: {err}"


def test_blocker_c_model_output_cannot_invent_naqi(multi_pollutant_evidence):
    """Blocker C: Model output cannot invent or replace authoritative AQI/NAQI values."""
    assert multi_pollutant_evidence.indian_naqi is None
    text = "Current air quality exhibits a NAQI of 185."
    valid_actions = [
        AIInsightAction(
            action_id="ACT-PROTECT-N95-STREET",
            category=ActionCategory.PERSONAL_PROTECTION,
            priority=ActionPriority.HIGH,
            title=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].title,
            rationale=CANONICAL_ACTIONS["ACT-PROTECT-N95-STREET"].rationale,
            evidence_ids=["EVID-PM25"]
        )
    ]
    ok, err = DeterministicSafetyEngine.validate_synthesized_response(
        recommended_actions=valid_actions,
        eligible_action_ids={"ACT-PROTECT-N95-STREET"},
        valid_evidence_items=multi_pollutant_evidence.evidence_items,
        summary=text,
        evidence_context=multi_pollutant_evidence
    )
    assert not ok
    assert "official Indian NAQI is unavailable" in (err or "")


def test_blocker_c_existing_valid_fallback_behavior_functional(multi_pollutant_evidence):
    """Blocker C: Existing valid fallback behavior remains functional with verified evidence citations."""
    eligible_ids, _ = DeterministicSafetyEngine.determine_eligible_actions(
        multi_pollutant_evidence, ActivityContext.GENERAL, telemetry_usable=True
    )
    fallback = DeterministicSafetyEngine.generate_deterministic_fallback(
        multi_pollutant_evidence, ActivityContext.GENERAL, eligible_ids, "Test fallback", telemetry_usable=True
    )
    assert len(fallback) >= 1
    for act in fallback:
        assert act.action_id in CANONICAL_ACTIONS
        assert act.title == CANONICAL_ACTIONS[act.action_id].title
        assert act.rationale == CANONICAL_ACTIONS[act.action_id].rationale


# ===========================================================================
# BLOCKER A — Strict Timestamp & Forecast Provenance Verification Suites
# ===========================================================================

def test_blocker_a_01_missing_observation_timestamp_rejected(sample_location):
    """Blocker A.1: Missing observation timestamp rejects weather data with UNAVAILABLE status."""
    now = datetime.now(timezone.utc)
    w = NormalizedWeatherResponse(
        location=sample_location,
        provider="OpenAQ Weather",
        source_type=DataClassification.OBSERVATION,
        retrieved_at=now,
        observed_at=None,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="OpenAQ"
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(w)
    assert not usable
    assert freshness == FreshnessStatus.UNAVAILABLE
    assert "observation timestamp is missing" in (reason or "")


def test_blocker_a_02_naive_observation_timestamp_rejected(sample_location):
    """Blocker A.2: Naive observation timestamp must be rejected, not assumed UTC."""
    now = datetime.now(timezone.utc)
    w = NormalizedWeatherResponse(
        location=sample_location,
        provider="OpenAQ Weather",
        source_type=DataClassification.OBSERVATION,
        retrieved_at=now,
        observed_at=datetime(2026, 11, 18, 12, 0),  # Naive
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="OpenAQ"
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(w)
    assert not usable
    assert freshness == FreshnessStatus.INVALID
    assert "must be timezone-aware" in (reason or "")


def test_blocker_a_03_malformed_observation_timestamp_rejected(sample_location):
    """Blocker A.3: Malformed observation timestamp is rejected."""
    now = datetime.now(timezone.utc)
    w = NormalizedWeatherResponse.model_construct(
        location=sample_location,
        provider="OpenAQ Weather",
        source_type=DataClassification.OBSERVATION,
        retrieved_at=now,
        observed_at="invalid-date",
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="OpenAQ"
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(w)
    assert not usable
    assert freshness == FreshnessStatus.INVALID
    assert "malformed" in (reason or "")


def test_blocker_a_04_future_observation_timestamp_rejected(sample_location):
    """Blocker A.4: Future observation timestamp outside clock-skew (+5 min) is rejected."""
    now = datetime.now(timezone.utc)
    w = NormalizedWeatherResponse(
        location=sample_location,
        provider="OpenAQ Weather",
        source_type=DataClassification.OBSERVATION,
        retrieved_at=now,
        observed_at=now + timedelta(minutes=15),
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="OpenAQ"
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(w)
    assert not usable
    assert freshness == FreshnessStatus.INVALID
    assert "future-dated beyond clock-skew tolerance" in (reason or "")


def test_blocker_a_05_expired_observation_timestamp_rejected(sample_location):
    """Blocker A.5: Expired observation timestamp (>180 min) is rejected."""
    now = datetime.now(timezone.utc)
    w = NormalizedWeatherResponse(
        location=sample_location,
        provider="OpenAQ Weather",
        source_type=DataClassification.OBSERVATION,
        retrieved_at=now,
        observed_at=now - timedelta(minutes=240),
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="OpenAQ"
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(w)
    assert not usable
    assert freshness == FreshnessStatus.STALE
    assert "expired/stale" in (reason or "")


def test_blocker_a_06_missing_forecast_timestamp_with_current_period_rejected(sample_location):
    """Blocker A.6: Missing forecast timestamp with CURRENT_PERIOD cannot substitute for actual timestamp."""
    now = datetime.now(timezone.utc)
    w = NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp=None,
        forecast_validity=ForecastValidityStatus.CURRENT_PERIOD,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="Open-Meteo"
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(w)
    assert not usable
    assert freshness == FreshnessStatus.UNAVAILABLE
    assert "Missing weather forecast timestamp" in (reason or "")


def test_blocker_a_07_missing_forecast_timestamp_with_future_period_rejected(sample_location):
    """Blocker A.7: Missing forecast timestamp with FUTURE_PERIOD cannot substitute for actual timestamp."""
    now = datetime.now(timezone.utc)
    w = NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp=None,
        forecast_validity=ForecastValidityStatus.FUTURE_PERIOD,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="Open-Meteo"
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(w)
    assert not usable
    assert freshness == FreshnessStatus.UNAVAILABLE
    assert "Missing weather forecast timestamp" in (reason or "")


def test_blocker_a_08_naive_forecast_timestamp_rejected(sample_location):
    """Blocker A.8: Naive forecast timestamp is rejected, not assumed UTC."""
    now = datetime.now(timezone.utc)
    w = NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp=datetime(2026, 11, 18, 14, 0),  # Naive
        forecast_validity=ForecastValidityStatus.CURRENT_PERIOD,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="Open-Meteo"
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(w)
    assert not usable
    assert freshness == FreshnessStatus.INVALID
    assert "must be timezone-aware" in (reason or "")


def test_blocker_a_09_malformed_forecast_timestamp_rejected(sample_location):
    """Blocker A.9: Malformed forecast timestamp is rejected."""
    now = datetime.now(timezone.utc)
    w = NormalizedWeatherResponse.model_construct(
        location=sample_location,
        provider="Open-Meteo",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp="bad-ts",
        forecast_validity=ForecastValidityStatus.CURRENT_PERIOD,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="Open-Meteo"
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(w)
    assert not usable
    assert freshness == FreshnessStatus.INVALID
    assert "malformed" in (reason or "")


def test_blocker_a_10_expired_forecast_timestamp_rejected(sample_location):
    """Blocker A.10: Expired forecast timestamp (>60 min historical) is rejected."""
    now = datetime.now(timezone.utc)
    w = NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp=now - timedelta(hours=3),
        forecast_validity=ForecastValidityStatus.HISTORICAL_PERIOD,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="Open-Meteo"
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(w)
    assert not usable
    assert freshness == FreshnessStatus.STALE
    assert "expired" in (reason or "").lower()


def test_blocker_a_11_contradictory_forecast_validity_metadata(sample_location):
    """Blocker A.11: Contradictory forecast validity metadata is rejected with INVALID status."""
    now = datetime.now(timezone.utc)
    # Marked CURRENT_PERIOD but forecast_timestamp is 12 hours in future
    w1 = NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp=now + timedelta(hours=12),
        forecast_validity=ForecastValidityStatus.CURRENT_PERIOD,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="Open-Meteo"
    )
    usable1, freshness1, reason1 = DeterministicSafetyEngine.evaluate_weather_usability(w1)
    assert not usable1
    assert freshness1 == FreshnessStatus.INVALID
    assert "Contradictory forecast validity" in (reason1 or "")

    # Marked FUTURE_PERIOD but forecast_timestamp is 2 hours in past
    w2 = NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp=now - timedelta(hours=2),
        forecast_validity=ForecastValidityStatus.FUTURE_PERIOD,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="Open-Meteo"
    )
    usable2, freshness2, reason2 = DeterministicSafetyEngine.evaluate_weather_usability(w2)
    assert not usable2


def test_blocker_a_12_valid_current_forecast_accepted(sample_location):
    """Blocker A.12: Valid current forecast with tz-aware timestamp and matching validity passes."""
    now = datetime.now(timezone.utc)
    w = NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp=now,
        forecast_validity=ForecastValidityStatus.CURRENT_PERIOD,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="Open-Meteo"
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(w)
    assert usable
    assert freshness == FreshnessStatus.FRESH
    assert reason is None


def test_blocker_a_13_valid_future_forecast_accepted(sample_location):
    """Blocker A.13: Valid future forecast with future timestamp and FUTURE_PERIOD passes."""
    now = datetime.now(timezone.utc)
    w = NormalizedWeatherResponse(
        location=sample_location,
        provider="Open-Meteo",
        source_type=DataClassification.MODELLED_FORECAST,
        retrieved_at=now,
        forecast_timestamp=now + timedelta(hours=6),
        forecast_validity=ForecastValidityStatus.FUTURE_PERIOD,
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="Open-Meteo"
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(w)
    assert usable
    assert freshness == FreshnessStatus.FRESH
    assert reason is None


def test_blocker_a_14_existing_valid_observation_behavior_unchanged(sample_location):
    """Blocker A.14: Existing valid physical observation behavior remains functional."""
    now = datetime.now(timezone.utc)
    w = NormalizedWeatherResponse(
        location=sample_location,
        provider="OpenAQ Weather",
        source_type=DataClassification.OBSERVATION,
        retrieved_at=now,
        observed_at=now - timedelta(minutes=25),
        stagnation_risk="Low",
        dispersion_conditions="Favorable",
        stagnation_description="Test heuristic",
        source_attribution="OpenAQ"
    )
    usable, freshness, reason = DeterministicSafetyEngine.evaluate_weather_usability(w)
    assert usable
    assert freshness == FreshnessStatus.FRESH
    assert reason is None


def test_blocker_a_15_rejected_weather_isolated_from_actions_and_fallback(sample_location):
    """Blocker A.15: Rejected weather data cannot influence fallback summaries, factors, or actions."""
    now = datetime.now(timezone.utc)
    ctx = EnvironmentalEvidenceContext(
        location=sample_location,
        source_type=DataClassification.MODELLED_FORECAST,
        quality_status=QualityStatus.MODELLED_APPROXIMATION,
        retrieval_freshness=FreshnessStatus.FRESH,
        retrieved_at=now,
        weather_usable=False,
        weather_unusable_reason="Weather forecast timestep is expired",
        evidence_items={
            "EVID-PM25": EnvironmentalEvidenceItem(evidence_id="EVID-PM25", parameter="PM2.5", value="85.0", unit="µg/m³", classification=DataClassification.MODELLED_FORECAST, freshness=FreshnessStatus.FRESH, context_note="test", timestamp=now, averaging_period="1-hour"),
            "EVID-WEATHER-WIND": EnvironmentalEvidenceItem(evidence_id="EVID-WEATHER-WIND", parameter="Wind", value="5.5", unit="km/h", classification=DataClassification.MODELLED_FORECAST, freshness=FreshnessStatus.STALE, context_note="stale", timestamp=now - timedelta(hours=5)),
            "EVID-DISPERSION": EnvironmentalEvidenceItem(evidence_id="EVID-DISPERSION", parameter="Dispersion", value="Unknown", unit=None, classification=DataClassification.MODELLED_FORECAST, freshness=FreshnessStatus.STALE, context_note="unusable")
        },
        stagnation_risk="Unknown",
        dispersion_conditions="Unknown"
    )
    eligible_ids, _ = DeterministicSafetyEngine.determine_eligible_actions(ctx, ActivityContext.GENERAL, telemetry_usable=True)
    assert "ACT-EXERCISE-RESCHEDULE" not in eligible_ids
    assert "ACT-VENT-MONITOR-BASELINE" not in eligible_ids

    fallback = DeterministicSafetyEngine.generate_deterministic_fallback(ctx, ActivityContext.GENERAL, eligible_ids, "Weather stale", telemetry_usable=True)
    for act in fallback:
        assert "EVID-WEATHER-WIND" not in act.evidence_ids
        assert "EVID-DISPERSION" not in act.evidence_ids


# ===========================================================================
# BLOCKER B — Grounded Evidence Verification for All 8 Criteria Pollutants
# ===========================================================================

@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_b_01_matching_claim_with_fresh_valid_evidence_passes(multi_pollutant_evidence, pollutant):
    """Blocker B.1: Fresh, correctly unit-labelled evidence with a matching numerical claim passes."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    text = f"The {pollutant} concentration was {actual_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert ok, f"Failed for {pollutant}: {err}"


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_b_02_stale_evidence_rejects_matching_claim(multi_pollutant_evidence, pollutant):
    """Blocker B.2: Stale evidence rejects matching numerical claims even when evidence ID exists."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    item = multi_pollutant_evidence.evidence_items[cfg["evid_key"]]
    stale_item = item.model_copy(update={"freshness": FreshnessStatus.STALE})
    ctx = multi_pollutant_evidence.model_copy(update={"evidence_items": {**multi_pollutant_evidence.evidence_items, cfg["evid_key"]: stale_item}})

    actual_val = float(stale_item.value)
    text = f"Current {pollutant} reading is {actual_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, ctx)
    assert not ok
    assert "stale or invalid evidence cannot validate" in (err or "")


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_b_03_missing_evidence_unit_rejects_claim(multi_pollutant_evidence, pollutant):
    """Blocker B.3: Missing evidence unit metadata rejects numerical claims."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    item = multi_pollutant_evidence.evidence_items[cfg["evid_key"]]
    nounit_item = item.model_copy(update={"unit": None})
    ctx = multi_pollutant_evidence.model_copy(update={"evidence_items": {**multi_pollutant_evidence.evidence_items, cfg["evid_key"]: nounit_item}})

    actual_val = float(item.value)
    text = f"The {pollutant} concentration is {actual_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, ctx)
    assert not ok
    assert "missing unit metadata" in (err or "")


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_b_04_incompatible_evidence_unit_rejects_claim(multi_pollutant_evidence, pollutant):
    """Blocker B.4: Incompatible recorded unit in evidence rejects numerical claims."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    item = multi_pollutant_evidence.evidence_items[cfg["evid_key"]]
    bad_unit = "ppm" if cfg["default_unit"] != "ppm" else "µg/m³"
    bad_item = item.model_copy(update={"unit": bad_unit})
    ctx = multi_pollutant_evidence.model_copy(update={"evidence_items": {**multi_pollutant_evidence.evidence_items, cfg["evid_key"]: bad_item}})

    actual_val = float(item.value)
    text = f"The {pollutant} level is {actual_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, ctx)
    assert not ok
    assert "incompatible recorded unit" in (err or "")


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_b_05_modelled_claimed_as_physical_observation_rejected(multi_pollutant_evidence, pollutant):
    """Blocker B.5: Modelled data claimed as physical ground station observation is rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    text = f"A ground station recorded physical measurement of {pollutant} at {actual_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "physical ground station observation" in (err or "").lower() or "physical observation" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_b_06_missing_evidence_timestamp_rejected(multi_pollutant_evidence, pollutant):
    """Blocker B.6: Evidence with missing timestamp provenance cannot validate claims."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    item = multi_pollutant_evidence.evidence_items[cfg["evid_key"]]
    nots_item = item.model_copy(update={"timestamp": None})
    ctx = multi_pollutant_evidence.model_copy(update={"evidence_items": {**multi_pollutant_evidence.evidence_items, cfg["evid_key"]: nots_item}})

    actual_val = float(item.value)
    text = f"The {pollutant} concentration was {actual_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, ctx)
    assert not ok
    assert "missing timestamp provenance" in (err or "")


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_b_07_naive_evidence_timestamp_rejected(multi_pollutant_evidence, pollutant):
    """Blocker B.7: Evidence with naive timestamp is rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    item = multi_pollutant_evidence.evidence_items[cfg["evid_key"]]
    naive_item = item.model_copy(update={"timestamp": datetime(2026, 11, 18, 12, 0)})
    ctx = multi_pollutant_evidence.model_copy(update={"evidence_items": {**multi_pollutant_evidence.evidence_items, cfg["evid_key"]: naive_item}})

    actual_val = float(item.value)
    text = f"The {pollutant} reading was {actual_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, ctx)
    assert not ok
    assert "must be timezone-aware" in (err or "")


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_b_08_numeric_mismatch_rejected(multi_pollutant_evidence, pollutant):
    """Blocker B.8: Numeric mismatch between model claim and evidence is rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    mismatched_val = actual_val + 35.0
    text = f"The {pollutant} concentration is {mismatched_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "conflicts with verified telemetry" in (err or "")


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_blocker_b_09_unsupported_averaging_period_assertion_rejected(multi_pollutant_evidence, pollutant):
    """Blocker B.9: Hourly/instantaneous modelled data cannot assert statutory regulatory exceedance."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    text = f"{pollutant} exceeds the statutory standard."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "NAAQS regulatory exceedance" in (err or "")


def test_blocker_b_10_stale_evidence_id_existence_insufficient(multi_pollutant_evidence):
    """Blocker B.10: Stale evidence cannot validate claims even if its evidence ID exists."""
    now = datetime.now(timezone.utc)
    stale_pm25 = EnvironmentalEvidenceItem(
        evidence_id="EVID-PM25", parameter="PM2.5", value="85.0", unit="µg/m³",
        classification=DataClassification.OBSERVATION,
        freshness=FreshnessStatus.STALE,
        context_note="Stale", timestamp=now - timedelta(hours=5)
    )
    ctx = multi_pollutant_evidence.model_copy(update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": stale_pm25}})
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM2.5 is 85.0 µg/m³.", ctx)
    assert not ok
    assert "stale or invalid evidence cannot validate" in (err or "")


def test_blocker_b_11_unsupported_regulatory_claims_rejected(multi_pollutant_evidence):
    """Blocker B.11: Unsupported statutory limit assertions without regulatory averaging are rejected."""
    text = "The 24-hour PM2.5 standard is violated."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "NAAQS regulatory exceedance" in (err or "")


def test_blocker_b_12_valid_evidence_backed_numerical_explanations_work(multi_pollutant_evidence):
    """Blocker B.12: Valid evidence-backed numerical claims for multiple pollutants pass cleanly."""
    text = "PM2.5 was 85.0 µg/m³ and PM10 was 145.0 µg/m³ under 5.5 km/h surface wind."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert ok, f"Expected clean pass but got: {err}"


def test_blocker_b_13_existing_qualitative_explanations_work(multi_pollutant_evidence):
    """Blocker B.13: Standard qualitative explanations without numbers pass without false positives."""
    text = "Atmospheric conditions are stable. Sensitive individuals should consider wearing respirators outdoors."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert ok, f"Expected clean pass for qualitative text: {err}"


# ===========================================================================
# BLOCKER C — Robust Claim Extraction & Explicit Regression Examples
# ===========================================================================

def test_blocker_c_example_01_bare_pm10_rejected(multi_pollutant_evidence):
    """Blocker C Example 1: 'PM10 concentration was 180.' rejected as bare number."""
    text = "PM10 concentration was 180."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "without explicit physical unit" in (err or "")
    assert "PM10" in (err or "")


def test_blocker_c_example_02_colon_pm10_rejected(multi_pollutant_evidence):
    """Blocker C Example 2: 'PM10: 180.' rejected as bare number."""
    text = "PM10: 180."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "without explicit physical unit" in (err or "")
    assert "PM10" in (err or "")


def test_blocker_c_example_03_paren_pm10_rejected(multi_pollutant_evidence):
    """Blocker C Example 3: 'The PM10 reading (180) is elevated.' rejected as bare number."""
    text = "The PM10 reading (180) is elevated."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "without explicit physical unit" in (err or "")
    assert "PM10" in (err or "")


def test_blocker_c_example_04_number_before_pm10_rejected(multi_pollutant_evidence):
    """Blocker C Example 4: 'A concentration of 180 was recorded for PM10.' rejected as bare number."""
    text = "A concentration of 180 was recorded for PM10."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "without explicit physical unit" in (err or "")
    assert "PM10" in (err or "")


def test_blocker_c_example_05_bare_no2_rejected(multi_pollutant_evidence):
    """Blocker C Example 5: 'NO2 levels reached 95.' rejected as bare number."""
    text = "NO2 levels reached 95."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "without explicit physical unit" in (err or "")
    assert "NO2" in (err or "")


def test_blocker_c_example_06_ozone_with_unit_verified(multi_pollutant_evidence):
    """Blocker C Example 6: 'Ozone measured 120 µg/m³.' verified against telemetry."""
    # Telemetry has O3 = 65.0 µg/m³ -> 120 µg/m³ must be rejected as mismatch
    text = "Ozone measured 120 µg/m³."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "conflicts with verified telemetry" in (err or "")

    # When telemetry has O3 = 120.0 µg/m³ -> passes!
    now = datetime.now(timezone.utc)
    o3_120 = EnvironmentalEvidenceItem(
        evidence_id="EVID-O3", parameter="O3", value="120.0", unit="µg/m³",
        classification=DataClassification.MODELLED_FORECAST,
        freshness=FreshnessStatus.FRESH,
        context_note="O3 test", timestamp=now, averaging_period="1-hour"
    )
    ctx = multi_pollutant_evidence.model_copy(update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-O3": o3_120}})
    ok2, err2 = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, ctx)
    assert ok2, f"Failed matching Ozone: {err2}"


def test_blocker_c_example_07_pm25_with_unit_verified(multi_pollutant_evidence):
    """Blocker C Example 7: 'PM2.5 was 85 µg/m³.' verified against telemetry."""
    # Telemetry has PM2.5 = 85.0 µg/m³ -> passes!
    text = "PM2.5 was 85 µg/m³."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert ok, f"Failed matching PM2.5: {err}"

    # When text claims 25 µg/m³ -> rejected!
    text_bad = "PM2.5 was 25 µg/m³."
    ok_bad, err_bad = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text_bad, multi_pollutant_evidence)
    assert not ok_bad
    assert "conflicts with verified telemetry" in (err_bad or "")


def test_blocker_c_example_08_aqi_assertion_verified(multi_pollutant_evidence):
    """Blocker C Example 8: 'The AQI is 240.' verified against official NAQI."""
    # Telemetry has indian_naqi=None -> rejected!
    text = "The AQI is 240."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "official Indian NAQI is unavailable" in (err or "")

    # Telemetry has indian_naqi=150 -> rejected as mismatch!
    ctx_150 = multi_pollutant_evidence.model_copy(update={"indian_naqi": 150})
    ok_150, err_150 = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, ctx_150)
    assert not ok_150
    assert "contradicts verified telemetry NAQI" in (err_150 or "")

    # Telemetry has indian_naqi=240 -> passes!
    ctx_240 = multi_pollutant_evidence.model_copy(update={"indian_naqi": 240})
    ok_240, err_240 = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, ctx_240)
    assert ok_240


def test_blocker_c_example_09_statutory_pm10_limit_rejected(multi_pollutant_evidence):
    """Blocker C Example 9: 'The 24-hour PM10 limit has been exceeded.' rejected on modelled data."""
    text = "The 24-hour PM10 limit has been exceeded."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "NAAQS regulatory exceedance" in (err or "")


def test_blocker_c_scientific_notation_supported(multi_pollutant_evidence):
    """Blocker C: Scientific notation is parsed and validated against evidence."""
    # PM10 is 145.0 in evidence
    text = "PM10 was measured at 1.45e2 µg/m³."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert ok, f"Failed scientific notation: {err}"

    # Scientific notation mismatch
    text_bad = "PM10 was measured at 2.5e2 µg/m³."
    ok_bad, err_bad = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text_bad, multi_pollutant_evidence)
    assert not ok_bad
    assert "conflicts with verified telemetry" in (err_bad or "")


def test_blocker_c_split_sentence_claim_extracted(multi_pollutant_evidence):
    """Blocker C: Claims split across sentences with anaphora are extracted and checked."""
    # Matching claim split across sentences
    text_good = "We monitored PM10. The concentration was 145 µg/m³."
    ok_good, err_good = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text_good, multi_pollutant_evidence)
    assert ok_good, f"Failed split sentence good: {err_good}"

    # Mismatched claim split across sentences
    text_bad = "We monitored PM10. The concentration was 180 µg/m³."
    ok_bad, err_bad = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text_bad, multi_pollutant_evidence)
    assert not ok_bad
    assert "conflicts with verified telemetry" in (err_bad or "")

    # Bare number split across sentences
    text_bare = "We monitored PM10. The concentration was 180."
    ok_bare, err_bare = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text_bare, multi_pollutant_evidence)
    assert not ok_bare
    assert "without explicit physical unit" in (err_bare or "")


def test_blocker_c_non_environmental_metadata_passes(multi_pollutant_evidence):
    """Blocker C: Qualitative guidance and non-environmental metadata pass without false rejection."""
    non_env_statements = [
        "Conduct short 10-15 minute cross-ventilation.",
        "N95 respirators filter 95% of fine particles.",
        "HEPA purifiers remove 99.97% of particulates.",
        "Wait until 3 pm for better mixing conditions.",
        "Walk at least 500 meters away from arterial roads."
    ]
    for s in non_env_statements:
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(s, multi_pollutant_evidence)
        assert ok, f"False rejection for '{s}': {err}"


# ==============================================================================
# FINAL EVIDENCE INTEGRITY CORRECTION SUITES (CORRECTIONS A, B, C)
# ==============================================================================

# --- CORRECTION A: STRICT FRESHNESS ALLOWLIST ---

def test_final_correction_a_not_configured_rejected(multi_pollutant_evidence):
    """Correction A.1: NOT_CONFIGURED evidence status is strictly rejected."""
    now = datetime.now(timezone.utc)
    pm25_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"freshness": FreshnessStatus.NOT_CONFIGURED}
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": pm25_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM2.5 is 85.0 µg/m³.", ctx)
    assert not ok
    assert "NOT_CONFIGURED" in (err or "")
    assert "stale or invalid evidence cannot validate" in (err or "")


def test_final_correction_a_stale_rejected(multi_pollutant_evidence):
    """Correction A.2: STALE evidence status is strictly rejected."""
    pm25_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"freshness": FreshnessStatus.STALE}
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": pm25_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM2.5 is 85.0 µg/m³.", ctx)
    assert not ok
    assert "STALE" in (err or "")
    assert "stale or invalid evidence cannot validate" in (err or "")


def test_final_correction_a_invalid_rejected(multi_pollutant_evidence):
    """Correction A.3: INVALID evidence status is strictly rejected."""
    pm25_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"freshness": FreshnessStatus.INVALID}
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": pm25_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM2.5 is 85.0 µg/m³.", ctx)
    assert not ok
    assert "INVALID" in (err or "")
    assert "stale or invalid evidence cannot validate" in (err or "")


def test_final_correction_a_unavailable_rejected(multi_pollutant_evidence):
    """Correction A.4: UNAVAILABLE evidence status is strictly rejected."""
    pm25_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"freshness": FreshnessStatus.UNAVAILABLE}
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": pm25_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM2.5 is 85.0 µg/m³.", ctx)
    assert not ok
    assert "UNAVAILABLE" in (err or "")
    assert "stale or invalid evidence cannot validate" in (err or "")


def test_final_correction_a_missing_freshness_rejected(multi_pollutant_evidence):
    """Correction A.5: Missing freshness status (None) is strictly rejected."""
    pm25_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_construct(
        evidence_id="EVID-PM25", parameter="PM2.5", value="85.0", unit="µg/m³",
        classification=DataClassification.MODELLED_FORECAST,
        freshness=None, context_note="Missing freshness",
        timestamp=datetime.now(timezone.utc), averaging_period="1-hour"
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": pm25_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM2.5 is 85.0 µg/m³.", ctx)
    assert not ok
    assert "missing freshness status" in (err or "").lower()


def test_final_correction_a_unknown_freshness_rejected(multi_pollutant_evidence):
    """Correction A.6: Unknown or corrupted freshness status is strictly rejected."""
    pm25_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_construct(
        evidence_id="EVID-PM25", parameter="PM2.5", value="85.0", unit="µg/m³",
        classification=DataClassification.MODELLED_FORECAST,
        freshness="UNKNOWN_CORRUPTED_STATUS", context_note="Unknown status",
        timestamp=datetime.now(timezone.utc), averaging_period="1-hour"
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": pm25_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM2.5 is 85.0 µg/m³.", ctx)
    assert not ok
    assert "UNKNOWN_CORRUPTED_STATUS" in (err or "")


def test_final_correction_a_fresh_accepted(multi_pollutant_evidence):
    """Correction A.7: Valid FRESH evidence status is accepted."""
    pm25_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"freshness": FreshnessStatus.FRESH}
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": pm25_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM2.5 is 85.0 µg/m³.", ctx)
    assert ok, f"FRESH evidence unexpectedly failed: {err}"


def test_final_correction_a_recent_accepted(multi_pollutant_evidence):
    """Correction A.8: Valid RECENT evidence status is accepted."""
    pm25_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"freshness": FreshnessStatus.RECENT}
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": pm25_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM2.5 is 85.0 µg/m³.", ctx)
    assert ok, f"RECENT evidence unexpectedly failed: {err}"


# --- CORRECTION B: COMPLETE DIMENSIONAL UNIT VALIDATION ---

@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_final_correction_b_01_complete_unit_accepted(multi_pollutant_evidence, pollutant):
    """Correction B.1: Correct, complete dimensional units and Unicode aliases are accepted."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)

    if pollutant == "CO":
        test_units = ["mg/m³", "mg/m3", "milligrams per cubic meter", "milligrams/m3"]
    else:
        test_units = ["µg/m³", "μg/m³", "ug/m3", "micrograms per cubic meter", "micrograms/m3"]

    for unit_variant in test_units:
        text = f"The {pollutant} level is {actual_val} {unit_variant}."
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
        assert ok, f"Failed for {pollutant} with complete unit '{unit_variant}': {err}"


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_final_correction_b_02_missing_unit_rejected(multi_pollutant_evidence, pollutant):
    """Correction B.2: Missing unit metadata in evidence item is rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    item = multi_pollutant_evidence.evidence_items[cfg["evid_key"]]
    nounit_item = item.model_copy(update={"unit": ""})
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, cfg["evid_key"]: nounit_item}}
    )
    actual_val = float(item.value)
    text = f"{pollutant} concentration is {actual_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, ctx)
    assert not ok
    assert "missing unit metadata" in (err or "")


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_final_correction_b_03_bare_mass_unit_rejected(multi_pollutant_evidence, pollutant):
    """Correction B.3: Bare mass units without volume denominator are strictly rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)

    # 1. Reject in model claim text (e.g. "85 µg", "85 mg", "85 micrograms")
    bare_claimed_units = ["µg", "μg", "ug", "mg", "micrograms", "milligrams"]
    for bare_unit in bare_claimed_units:
        text = f"The {pollutant} concentration is {actual_val} {bare_unit}."
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
        assert not ok, f"Expected rejection of bare mass unit '{bare_unit}' for {pollutant}"
        assert ("invalid unit" in (err or "").lower() or "without explicit physical unit" in (err or "").lower())

    # 2. Reject in evidence item metadata (evidence item has bare "micrograms" or "mg")
    item = multi_pollutant_evidence.evidence_items[cfg["evid_key"]]
    bare_evidence_item = item.model_copy(update={"unit": "micrograms" if pollutant != "CO" else "milligrams"})
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, cfg["evid_key"]: bare_evidence_item}}
    )
    ok_ev, err_ev = DeterministicSafetyEngine.check_numerical_and_scientific_claims(
        f"{pollutant} is {actual_val} {cfg['default_unit']}.", ctx
    )
    assert not ok_ev
    assert "incompatible recorded unit" in (err_ev or "")


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_final_correction_b_04_incompatible_unit_rejected(multi_pollutant_evidence, pollutant):
    """Correction B.4: Incompatible units like ppm, ppb, or percentages are rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)

    incompatible = ["ppm", "ppb", "%"]
    for incomp_unit in incompatible:
        text = f"The {pollutant} reading was {actual_val} {incomp_unit}."
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
        assert not ok
        assert "invalid unit" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_final_correction_b_05_differing_unit_rejected(multi_pollutant_evidence, pollutant):
    """Correction B.5: Claim with unit differing from evidence unit is rejected without unverified conversion."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)

    if pollutant == "CO":
        # CO evidence is in mg/m³; claiming µg/m³ is rejected
        text = f"The {pollutant} level is {actual_val} µg/m³."
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
        assert not ok
        assert "invalid unit" in (err or "").lower()
    else:
        # Particulate/gas evidence is in µg/m³; claiming mg/m³ is rejected
        text = f"The {pollutant} level is {actual_val} mg/m³."
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
        assert not ok
        assert "invalid unit" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_final_correction_b_06_ambiguous_unit_metadata_rejected(multi_pollutant_evidence, pollutant):
    """Correction B.6: Ambiguous or incomplete unit metadata in evidence cannot validate numerical claims."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    item = multi_pollutant_evidence.evidence_items[cfg["evid_key"]]
    ambiguous_item = item.model_copy(update={"unit": "arbitrary_scale"})
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, cfg["evid_key"]: ambiguous_item}}
    )
    actual_val = float(item.value)
    text = f"The {pollutant} level is {actual_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, ctx)
    assert not ok
    assert "incompatible recorded unit" in (err or "")


# --- CORRECTION C: BOUND FORECAST EVIDENCE TIMESTAMPS ---

def test_final_correction_c_01_valid_current_modelled_evidence(multi_pollutant_evidence):
    """Correction C.1: Valid current modelled evidence (within ±60 minutes) passes."""
    ref_now = datetime(2026, 11, 18, 12, 0, 0, tzinfo=timezone.utc)
    # 15 minutes in the future (within current hour period)
    valid_current_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"timestamp": ref_now + timedelta(minutes=15)}
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": valid_current_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(
        "PM2.5 is 85.0 µg/m³.", ctx, reference_time=ref_now
    )
    assert ok, f"Current modelled evidence unexpectedly rejected: {err}"


def test_final_correction_c_02_valid_future_forecast_evidence(multi_pollutant_evidence):
    """Correction C.2: Valid future forecast evidence (+24 hours, within 48h horizon) passes."""
    ref_now = datetime(2026, 11, 18, 12, 0, 0, tzinfo=timezone.utc)
    valid_future_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"timestamp": ref_now + timedelta(hours=24)}
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": valid_future_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(
        "PM2.5 is 85.0 µg/m³.", ctx, reference_time=ref_now
    )
    assert ok, f"Future forecast evidence unexpectedly rejected: {err}"


def test_final_correction_c_03_forecast_timestamp_exact_future_boundary(multi_pollutant_evidence):
    """Correction C.3: Forecast timestamp exactly at the 48-hour boundary passes."""
    ref_now = datetime(2026, 11, 18, 12, 0, 0, tzinfo=timezone.utc)
    boundary_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"timestamp": ref_now + timedelta(hours=48)}
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": boundary_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(
        "PM2.5 is 85.0 µg/m³.", ctx, reference_time=ref_now
    )
    assert ok, f"Exact 48h boundary forecast unexpectedly rejected: {err}"


def test_final_correction_c_04_forecast_timestamp_just_beyond_future_boundary(multi_pollutant_evidence):
    """Correction C.4: Forecast timestamp just beyond the 48-hour boundary is rejected."""
    ref_now = datetime(2026, 11, 18, 12, 0, 0, tzinfo=timezone.utc)
    beyond_boundary_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"timestamp": ref_now + timedelta(hours=48, minutes=1)}
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": beyond_boundary_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(
        "PM2.5 is 85.0 µg/m³.", ctx, reference_time=ref_now
    )
    assert not ok
    assert "exceeds maximum permitted forecast horizon" in (err or "")


def test_final_correction_c_05_forecast_timestamp_arbitrarily_far_future(multi_pollutant_evidence):
    """Correction C.5: Forecast timestamp arbitrarily far in the future (+30 days) is rejected."""
    ref_now = datetime(2026, 11, 18, 12, 0, 0, tzinfo=timezone.utc)
    far_future_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"timestamp": ref_now + timedelta(days=30)}
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": far_future_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(
        "PM2.5 is 85.0 µg/m³.", ctx, reference_time=ref_now
    )
    assert not ok
    assert "exceeds maximum permitted forecast horizon" in (err or "")


def test_final_correction_c_06_forecast_timestamp_beyond_past_boundary(multi_pollutant_evidence):
    """Correction C.6: Forecast timestamp beyond permitted past boundary (>60 min in past) is rejected."""
    ref_now = datetime(2026, 11, 18, 12, 0, 0, tzinfo=timezone.utc)
    past_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"timestamp": ref_now - timedelta(minutes=65)}
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": past_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(
        "PM2.5 is 85.0 µg/m³.", ctx, reference_time=ref_now
    )
    assert not ok
    assert "forecast timestamp is expired" in (err or "")


def test_final_correction_c_07_missing_forecast_timestamp(multi_pollutant_evidence):
    """Correction C.7: Missing forecast timestamp is rejected."""
    ref_now = datetime(2026, 11, 18, 12, 0, 0, tzinfo=timezone.utc)
    nots_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"timestamp": None}
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": nots_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(
        "PM2.5 is 85.0 µg/m³.", ctx, reference_time=ref_now
    )
    assert not ok
    assert "missing timestamp provenance" in (err or "")


def test_final_correction_c_08_naive_forecast_timestamp(multi_pollutant_evidence):
    """Correction C.8: Naive forecast timestamp is rejected."""
    ref_now = datetime(2026, 11, 18, 12, 0, 0, tzinfo=timezone.utc)
    naive_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={"timestamp": datetime(2026, 11, 18, 12, 30)}  # Naive
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": naive_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(
        "PM2.5 is 85.0 µg/m³.", ctx, reference_time=ref_now
    )
    assert not ok
    assert "must be timezone-aware" in (err or "")


def test_final_correction_c_09_invalid_forecast_timestamp(multi_pollutant_evidence):
    """Correction C.9: Non-datetime malformed timestamp is rejected."""
    ref_now = datetime(2026, 11, 18, 12, 0, 0, tzinfo=timezone.utc)
    malformed_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_construct(
        evidence_id="EVID-PM25", parameter="PM2.5", value="85.0", unit="µg/m³",
        classification=DataClassification.MODELLED_FORECAST,
        freshness=FreshnessStatus.FRESH, context_note="Malformed ts",
        timestamp="invalid-timestamp-string", averaging_period="1-hour"
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": malformed_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(
        "PM2.5 is 85.0 µg/m³.", ctx, reference_time=ref_now
    )
    assert not ok
    assert "timestamp is malformed" in (err or "")


def test_final_correction_c_10_contradictory_source_and_timestamp(multi_pollutant_evidence):
    """Correction C.10: Physical observation classified item with future timestamp contradicts source classification and is rejected."""
    ref_now = datetime(2026, 11, 18, 12, 0, 0, tzinfo=timezone.utc)
    future_obs_item = multi_pollutant_evidence.evidence_items["EVID-PM25"].model_copy(
        update={
            "classification": DataClassification.OBSERVATION,
            "timestamp": ref_now + timedelta(hours=6)  # Observations cannot be in the future!
        }
    )
    ctx = multi_pollutant_evidence.model_copy(
        update={"evidence_items": {**multi_pollutant_evidence.evidence_items, "EVID-PM25": future_obs_item}}
    )
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(
        "PM2.5 is 85.0 µg/m³.", ctx, reference_time=ref_now
    )
    assert not ok
    assert "observation timestamp is future-dated" in (err or "")


# ==============================================================================
# FINAL NUMERICAL CLAIM PARSER CORRECTION SUITES (TOKEN BOUNDARIES & SIGNS)
# ==============================================================================

# --- CORRECTION A: COMPLETE UNIT-TOKEN BOUNDARIES ---

@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_unit_token_junk_suffix_rejected(multi_pollutant_evidence, pollutant):
    """Unit token correction: Suffix like 'junk' or 'extra' attached to unit is strictly rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    
    # Attached alphanumeric suffix
    text1 = f"{pollutant} is {actual_val} {cfg['default_unit']}junk"
    ok1, err1 = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text1, multi_pollutant_evidence)
    assert not ok1, f"Expected rejection of unit with junk suffix for {pollutant}"
    assert "invalid or malformed unit token" in (err1 or "") or "invalid unit" in (err1 or "").lower()

    text2 = f"{pollutant} is {actual_val} {cfg['default_unit']}extra"
    ok2, err2 = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text2, multi_pollutant_evidence)
    assert not ok2, f"Expected rejection of unit with extra suffix for {pollutant}"
    assert "invalid or malformed unit token" in (err2 or "") or "invalid unit" in (err2 or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_unit_token_day_rate_suffix_rejected(multi_pollutant_evidence, pollutant):
    """Unit token correction: Appended rate dimension like '/day' or ' per day' is strictly rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)

    # Immediately attached slash-rate
    text1 = f"{pollutant} is {actual_val} {cfg['default_unit']}/day"
    ok1, err1 = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text1, multi_pollutant_evidence)
    assert not ok1, f"Expected rejection of /day suffix for {pollutant}"
    assert "invalid or malformed unit token" in (err1 or "") or "invalid unit" in (err1 or "").lower()

    # Spaced slash-rate
    text2 = f"{pollutant} is {actual_val} {cfg['default_unit']} / day"
    ok2, err2 = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text2, multi_pollutant_evidence)
    assert not ok2, f"Expected rejection of ' / day' suffix for {pollutant}"
    assert "invalid or malformed unit token" in (err2 or "") or "invalid unit" in (err2 or "").lower()

    # Word rate
    text3 = f"{pollutant} is {actual_val} {cfg['default_unit']} per day"
    ok3, err3 = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text3, multi_pollutant_evidence)
    assert not ok3, f"Expected rejection of 'per day' suffix for {pollutant}"
    assert "invalid or malformed unit token" in (err3 or "") or "invalid unit" in (err3 or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_unit_token_unsupported_dimensional_suffix_rejected(multi_pollutant_evidence, pollutant):
    """Unit token correction: Attached hyphens or unsupported rates like '-ish' or '/hr' are rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)

    text1 = f"{pollutant} is {actual_val} {cfg['default_unit']}-ish"
    ok1, err1 = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text1, multi_pollutant_evidence)
    assert not ok1
    assert "invalid or malformed unit token" in (err1 or "") or "invalid unit" in (err1 or "").lower()

    text2 = f"{pollutant} is {actual_val} {cfg['default_unit']}/hr"
    ok2, err2 = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text2, multi_pollutant_evidence)
    assert not ok2
    assert "invalid or malformed unit token" in (err2 or "") or "invalid unit" in (err2 or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_unit_token_ordinary_punctuation_accepted(multi_pollutant_evidence, pollutant):
    """Unit token correction: Legitimate punctuation (periods, commas, semicolons, exclamations) is accepted."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)

    punct_samples = [
        f"The {pollutant} level is {actual_val} {cfg['default_unit']}.",
        f"The {pollutant} level is {actual_val} {cfg['default_unit']}, which requires attention.",
        f"The {pollutant} level is {actual_val} {cfg['default_unit']}; monitor ventilation.",
        f"Caution: {pollutant} reached {actual_val} {cfg['default_unit']}!"
    ]
    for s in punct_samples:
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(s, multi_pollutant_evidence)
        assert ok, f"Punctuation unexpectedly rejected for '{s}': {err}"


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_unit_token_inside_parentheses_accepted(multi_pollutant_evidence, pollutant):
    """Unit token correction: Units inside parentheses are properly parsed and accepted."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)

    text1 = f"Measured ({pollutant}: {actual_val} {cfg['default_unit']}) during morning rush."
    ok1, err1 = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text1, multi_pollutant_evidence)
    assert ok1, f"Parenthesized claim rejected: {err1}"

    text2 = f"{pollutant} ({actual_val} {cfg['default_unit']}) is elevated."
    ok2, err2 = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text2, multi_pollutant_evidence)
    assert ok2, f"Parenthesized claim rejected: {err2}"


def test_unit_token_explicit_audit_examples(multi_pollutant_evidence):
    """Unit token correction: Explicit examples from defect audit report."""
    # 1. PM2.5 is 85 µg/m³junk -> rejected
    ok1, err1 = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM2.5 is 85 µg/m³junk", multi_pollutant_evidence)
    assert not ok1
    assert "invalid or malformed unit token" in (err1 or "") or "invalid unit" in (err1 or "").lower()

    # 2. PM2.5 is 85 µg/m³/day -> rejected
    ok2, err2 = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM2.5 is 85 µg/m³/day", multi_pollutant_evidence)
    assert not ok2
    assert "invalid or malformed unit token" in (err2 or "") or "invalid unit" in (err2 or "").lower()

    # 3. PM10 is 120 mg/m3extra -> rejected (both for unit incompatibility and token malformation)
    ok3, err3 = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM10 is 120 mg/m3extra", multi_pollutant_evidence)
    assert not ok3


# --- CORRECTION B: SIGN PRESERVATION & NEGATIVE CONCENTRATION REJECTION ---

def test_negative_concentration_explicit_audit_examples(multi_pollutant_evidence):
    """Sign correction: Explicit examples from defect audit report must be rejected."""
    # 1. PM2.5 is -85 µg/m³
    ok1, err1 = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM2.5 is -85 µg/m³", multi_pollutant_evidence)
    assert not ok1, "Negative PM2.5 was not rejected!"
    assert "negative" in (err1 or "").lower()

    # 2. PM10 concentration was -120 µg/m³
    ok2, err2 = DeterministicSafetyEngine.check_numerical_and_scientific_claims("PM10 concentration was -120 µg/m³", multi_pollutant_evidence)
    assert not ok2, "Negative PM10 was not rejected!"
    assert "negative" in (err2 or "").lower()

    # 3. NO2 measured -9.5 µg/m³
    ok3, err3 = DeterministicSafetyEngine.check_numerical_and_scientific_claims("NO2 measured -9.5 µg/m³", multi_pollutant_evidence)
    assert not ok3, "Negative NO2 was not rejected!"
    assert "negative" in (err3 or "").lower()

    # 4. SO2 is -8.5e1 µg/m³
    ok4, err4 = DeterministicSafetyEngine.check_numerical_and_scientific_claims("SO2 is -8.5e1 µg/m³", multi_pollutant_evidence)
    assert not ok4, "Negative scientific notation SO2 was not rejected!"
    assert "negative" in (err4 or "").lower()

    # 5. CO is -0.5 mg/m³
    ok5, err5 = DeterministicSafetyEngine.check_numerical_and_scientific_claims("CO is -0.5 mg/m³", multi_pollutant_evidence)
    assert not ok5, "Negative CO was not rejected!"
    assert "negative" in (err5 or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_negative_integer_rejected(multi_pollutant_evidence, pollutant):
    """Sign correction: Negative integer concentration is rejected across all pollutants."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = max(1, int(float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)))
    text = f"{pollutant} level is -{actual_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "negative" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_negative_zero_rejected(multi_pollutant_evidence, pollutant):
    """Sign correction: Negative zero (-0) concentration is rejected as negative across all pollutants."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    text = f"{pollutant} level is -0 {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "negative" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_negative_decimal_rejected(multi_pollutant_evidence, pollutant):
    """Sign correction: Negative decimal concentration is rejected across all pollutants."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    text = f"The {pollutant} reading was -{actual_val:.1f} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "negative" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_negative_scientific_notation_rejected(multi_pollutant_evidence, pollutant):
    """Sign correction: Negative scientific notation concentration is rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    text = f"{pollutant} concentration was -1.5e1 {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "negative" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_negative_claim_cannot_match_positive_evidence(multi_pollutant_evidence, pollutant):
    """Sign correction: A negative claim cannot match positive evidence via abs() normalization."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    
    # Claim -actual_val against +actual_val in evidence
    text = f"{pollutant} is -{actual_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "negative" in (err or "").lower()

    # Direct validation helper test
    ok_direct, err_direct = DeterministicSafetyEngine.validate_evidence_item_for_claim(
        evidence=multi_pollutant_evidence,
        evid_key=cfg["evid_key"],
        pol_code=pollutant,
        claimed_val=-actual_val,
        claimed_unit=cfg["default_unit"]
    )
    assert not ok_direct
    assert "negative" in (err_direct or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_positive_values_accepted_when_matching(multi_pollutant_evidence, pollutant):
    """Sign correction: Positive integers, decimals, and scientific notation matching evidence pass."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)

    # 1. Positive decimal
    text_dec = f"{pollutant} is {actual_val} {cfg['default_unit']}."
    ok_dec, err_dec = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text_dec, multi_pollutant_evidence)
    assert ok_dec, f"Positive decimal failed for {pollutant}: {err_dec}"

    # 2. Explicit positive sign (+val)
    text_plus = f"{pollutant} is +{actual_val} {cfg['default_unit']}."
    ok_plus, err_plus = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text_plus, multi_pollutant_evidence)
    assert ok_plus, f"Explicit positive +val failed for {pollutant}: {err_plus}"


def test_hyphens_in_metadata_and_dates_not_falsely_rejected(multi_pollutant_evidence):
    """Sign correction: Action IDs, calendar dates, durations, and temperatures are not falsely rejected as negative concentrations."""
    metadata_statements = [
        "Refer to action ACT-VENT-SEAL-TEMPORARY for ventilation guidance.",
        "Observation recorded on 2026-11-18 indicates standard diurnal patterns.",
        "Conduct a 10-15 minute cross-ventilation purge.",
        "The 24-hour baseline monitoring cycle remains active.",
        "Outdoor temperature dropped to -2°C overnight.",
        "N95 respirator provides at least 95% protection against particulate matter."
    ]
    for stmt in metadata_statements:
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(stmt, multi_pollutant_evidence)
        assert ok, f"Metadata statement falsely rejected for '{stmt}': {err}"


# ==============================================================================
# Phase 5 Final Unicode Parser Hardening Test Suite
# ==============================================================================

# ------------------------------------------------------------------------------
# Correction A: Unicode Minus Sign Preservation (U+2212 '−')
# ------------------------------------------------------------------------------

def test_unicode_minus_explicit_audit_examples(multi_pollutant_evidence):
    """Unicode hardening: Explicit audit examples with Unicode minus U+2212 are rejected as negative concentrations."""
    audit_cases = [
        ("PM2.5", "PM2.5 is −85 µg/m³"),
        ("PM10", "PM10 is −120 µg/m³"),
        ("NO2", "NO2 is −9.5 µg/m³"),
        ("SO2", "SO2 is −8.5e1 µg/m³"),
        ("CO", "CO is −0.5 mg/m³"),
    ]
    for pollutant, stmt in audit_cases:
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(stmt, multi_pollutant_evidence)
        assert not ok, f"Expected rejection for '{stmt}', but passed"
        assert "negative" in (err or "").lower(), f"Expected 'negative' in error for '{stmt}', got: {err}"


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_unicode_minus_negative_integer_rejected(multi_pollutant_evidence, pollutant):
    """Unicode hardening: Unicode minus with negative integer is rejected across all 8 pollutants."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = max(1, int(float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)))
    text = f"{pollutant} level is −{actual_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "negative" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_unicode_minus_negative_decimal_rejected(multi_pollutant_evidence, pollutant):
    """Unicode hardening: Unicode minus with negative decimal is rejected across all 8 pollutants."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    text = f"The {pollutant} reading was −{actual_val:.1f} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "negative" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_unicode_minus_negative_scientific_notation_rejected(multi_pollutant_evidence, pollutant):
    """Unicode hardening: Unicode minus with scientific notation is rejected across all 8 pollutants."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    text = f"{pollutant} concentration was −1.5e1 {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "negative" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_unicode_minus_cannot_match_positive_evidence(multi_pollutant_evidence, pollutant):
    """Unicode hardening: A claim with Unicode minus cannot match positive evidence telemetry."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    actual_val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    text = f"{pollutant} is −{actual_val} {cfg['default_unit']}."
    ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
    assert not ok
    assert "negative" in (err or "").lower()


def test_unicode_minus_temperatures_and_identifiers_not_false_negatives(multi_pollutant_evidence):
    """Unicode hardening: Temperatures with Unicode minus and ordinary hyphenated identifiers are preserved."""
    valid_statements = [
        "Outdoor temperature dropped to −2°C overnight.",
        "Temperature reading was −5 celsius during morning hours.",
        "Model-10 sensor recorded standard baseline metrics.",
        "Sensor−1 observation shows consistent calibration.",
        "Action ACT-VENT-SEAL-TEMPORARY was recommended.",
        "High-efficiency particulate filtration is active.",
    ]
    for stmt in valid_statements:
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(stmt, multi_pollutant_evidence)
        assert ok, f"Falsely rejected statement '{stmt}': {err}"


# ------------------------------------------------------------------------------
# Correction B: Unicode-Aware Unit-Token Boundaries
# ------------------------------------------------------------------------------

@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_unit_token_greek_suffix_rejected(multi_pollutant_evidence, pollutant):
    """Unicode hardening: Unit followed by Greek letter suffix (e.g. β, α, γ) is rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    for greek_letter in ["β", "α", "γ", "Ω"]:
        text = f"{pollutant} is {val} {cfg['default_unit']}{greek_letter}."
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
        assert not ok, f"Expected rejection for '{text}', but passed"
        assert "malformed unit token" in (err or "").lower() or "invalid unit" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_unit_token_unicode_letter_suffix_rejected(multi_pollutant_evidence, pollutant):
    """Unicode hardening: Unit followed by non-ASCII Unicode letter suffix (Cyrillic, accented) is rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    for uni_char in ["д", "ж", "é", "ñ", "ø"]:
        text = f"{pollutant} is {val} {cfg['default_unit']}{uni_char}."
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
        assert not ok, f"Expected rejection for '{text}', but passed"
        assert "malformed unit token" in (err or "").lower() or "invalid unit" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_unit_token_unicode_digit_suffix_rejected(multi_pollutant_evidence, pollutant):
    """Unicode hardening: Unit followed by Unicode digit/superscript suffix (e.g. ², ¹, १) is rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    for uni_digit in ["²", "¹", "⁰", "१", "١"]:
        text = f"{pollutant} is {val} {cfg['default_unit']}{uni_digit}."
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text, multi_pollutant_evidence)
        assert not ok, f"Expected rejection for '{text}', but passed"
        assert "malformed unit token" in (err or "").lower() or "invalid unit" in (err or "").lower()


@pytest.mark.parametrize("pollutant", POLLUTANT_TEST_KEYS)
def test_unit_token_preceding_unicode_malformed_rejected(multi_pollutant_evidence, pollutant):
    """Unicode hardening: Preceding unit with attached Unicode characters (e.g. βµg/m³ 85, µg/m³β 85) is rejected."""
    cfg = SUPPORTED_POLLUTANTS_CONFIG[pollutant]
    val = float(multi_pollutant_evidence.evidence_items[cfg["evid_key"]].value)
    
    # 1. Unicode prefix attached before preceding unit
    text_pre = f"{pollutant} is β{cfg['default_unit']} {val}."
    ok_pre, err_pre = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text_pre, multi_pollutant_evidence)
    assert not ok_pre, f"Expected rejection for '{text_pre}', but passed"
    assert "malformed unit token" in (err_pre or "").lower() or "invalid unit" in (err_pre or "").lower()

    # 2. Unicode suffix attached to preceding unit
    text_post = f"{pollutant} is {cfg['default_unit']}β {val}."
    ok_post, err_post = DeterministicSafetyEngine.check_numerical_and_scientific_claims(text_post, multi_pollutant_evidence)
    assert not ok_post, f"Expected rejection for '{text_post}', but passed"
    assert "malformed unit token" in (err_post or "").lower() or "invalid unit" in (err_post or "").lower() or "without explicit physical unit" in (err_post or "").lower()


def test_unit_token_unicode_punctuation_and_parentheses_accepted(multi_pollutant_evidence):
    """Unicode hardening: Legitimate Unicode quotes, brackets, and parentheses remain accepted."""
    statements = [
        "PM2.5 is (85 µg/m³).",
        "PM2.5 is [85 µg/m³].",
        "PM2.5 is {85 µg/m³}.",
        "PM2.5 level was “85 µg/m³”.",
        "PM2.5 level was ‘85 µg/m³’.",
        "PM2.5 is 85 µg/m³; conditions are steady.",
        "PM2.5 is 85 µg/m³, which aligns with seasonal norms.",
        "PM2.5 is 85 µg/m³!",
        "PM2.5 is 85 µg/m³?",
    ]
    for stmt in statements:
        ok, err = DeterministicSafetyEngine.check_numerical_and_scientific_claims(stmt, multi_pollutant_evidence)
        assert ok, f"Falsely rejected legitimate punctuation statement '{stmt}': {err}"



