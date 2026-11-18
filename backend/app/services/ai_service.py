"""AI Insights Service orchestrating telemetry ingest, safety rules, Gemini synthesis, and fallback."""
from datetime import datetime, timezone
from typing import Optional
import httpx

from ..core.config import settings
from ..core.logging import logger
from ..schemas.common import DataClassification, FreshnessStatus
from ..schemas.ai import (
    AIInsightRequest,
    AIInsightResponse,
    AIGenerationStatus,
    ActivityContext,
    AIInsightAction
)
from .air_quality_service import AirQualityService, air_quality_service as default_aq_service
from .weather_service import WeatherService, weather_service as default_weather_service
from .evidence_builder import build_evidence_context
from .deterministic_safety import DeterministicSafetyEngine, CANONICAL_ACTIONS
from ..ai.gemini_service import GeminiService, gemini_service as default_gemini_service
from ..ai.prompt_manager import PROMPT_VERSION, build_insight_prompt


class AIService:
    """Orchestrates environmental intelligence pipeline with deterministic safety supremacy."""

    def __init__(
        self,
        aq_service: Optional[AirQualityService] = None,
        weather_svc: Optional[WeatherService] = None,
        gemini_svc: Optional[GeminiService] = None
    ):
        self.aq_service = aq_service or default_aq_service
        self.weather_service = weather_svc or default_weather_service
        self.gemini_service = gemini_svc or default_gemini_service

    async def get_insights(
        self,
        request: AIInsightRequest,
        client: Optional[httpx.AsyncClient] = None
    ) -> AIInsightResponse:
        """Execute full Stage A -> B -> C -> D -> E environmental intelligence pipeline."""
        now_utc = datetime.now(timezone.utc)

        # STAGE A: Telemetry Retrieval via Existing Verified Services
        logger.info("Ingesting telemetry for coordinates (%s, %s)", request.latitude, request.longitude)
        air_quality = await self.aq_service.get_current_air_quality(
            latitude=request.latitude,
            longitude=request.longitude,
            client=client
        )
        weather = await self.weather_service.get_current_weather(
            latitude=request.latitude,
            longitude=request.longitude,
            client=client
        )

        # STAGE B: Evidence Context Construction
        evidence = build_evidence_context(air_quality, weather)

        # Check for simulated demo data
        if evidence.source_type == DataClassification.SIMULATED_DEMO:
            logger.info("Telemetry is SIMULATED_DEMO; returning deterministic demo guidance.")
            eligible_ids, _ = DeterministicSafetyEngine.determine_eligible_actions(
                evidence, request.activity_context, telemetry_usable=True
            )
            fallback_actions = DeterministicSafetyEngine.generate_deterministic_fallback(
                evidence, request.activity_context, eligible_ids, "Simulated demo scenario", telemetry_usable=True
            )
            return AIInsightResponse(
                location=evidence.location,
                activity_context=request.activity_context,
                status=AIGenerationStatus.SIMULATED_DEMO_INSIGHT,
                model_id=None,
                prompt_version=PROMPT_VERSION,
                generated_at=now_utc,
                summary="Curated demo scenario showing simulated particulate exposure and dispersion dynamics.",
                explanation=(
                    "This guidance reflects simulated demonstration data. Live physical sensor integration "
                    "or numerical atmospheric chemistry models are currently running in demo mode."
                ),
                supporting_factors=[
                    "Illustrative winter meteorological scenario",
                    "Simulated elevated particulate matter concentrations",
                    "Deterministic safety rules applied"
                ],
                recommended_actions=fallback_actions,
                evidence_context=evidence.evidence_items,
                source_classification=evidence.source_type,
                quality_status=evidence.quality_status,
                retrieval_freshness=evidence.retrieval_freshness,
                limitations=evidence.limitations + ["Illustrative demonstration data only; not verified live measurements."],
                fallback_reason="Underlying telemetry is classified as SIMULATED_DEMO."
            )

        # STAGE C: Data Quality, Freshness & Usability Evaluation
        is_usable, unusable_reason = DeterministicSafetyEngine.evaluate_usability(evidence)
        if not is_usable:
            logger.warning("Environmental telemetry unusable for AI synthesis: %s", unusable_reason)
            status_enum = (
                AIGenerationStatus.FALLBACK_STALE_DATA
                if "stale" in (unusable_reason or "").lower()
                else AIGenerationStatus.FALLBACK_INVALID_DATA
            )
            # When telemetry is stale or invalid, strictly restrict to baseline actions with NO telemetry evidence
            eligible_ids, _ = DeterministicSafetyEngine.determine_eligible_actions(
                evidence, request.activity_context, telemetry_usable=False
            )
            fallback_actions = DeterministicSafetyEngine.generate_deterministic_fallback(
                evidence, request.activity_context, eligible_ids, unusable_reason or "Unusable data", telemetry_usable=False
            )
            return AIInsightResponse(
                location=evidence.location,
                activity_context=request.activity_context,
                status=status_enum,
                model_id=None,
                prompt_version=PROMPT_VERSION,
                generated_at=now_utc,
                summary="Environmental data is currently stale or incomplete; providing baseline protective guidance.",
                explanation=(
                    f"Real-time AI synthesis is unavailable because underlying environmental telemetry cannot be verified: {unusable_reason}. "
                    "Protective baseline guidance is presented according to deterministic safety protocols without assuming current pollution levels."
                ),
                supporting_factors=["Baseline precautionary guidance (current telemetry unverified)"],
                recommended_actions=fallback_actions,
                evidence_context={},  # Stale telemetry is not presented as active evidence
                source_classification=evidence.source_type,
                quality_status=evidence.quality_status,
                retrieval_freshness=evidence.retrieval_freshness,
                limitations=evidence.limitations + [f"Data usability limitation: {unusable_reason}"],
                fallback_reason=unusable_reason
            )

        # STAGE D: Deterministic Action Allowlist & Safety Rule Generation
        eligible_action_ids, safety_rules = DeterministicSafetyEngine.determine_eligible_actions(
            evidence, request.activity_context, telemetry_usable=True
        )

        # Check Gemini API Key Configuration
        if not self.gemini_service.is_configured():
            logger.info("Gemini API key not configured; using deterministic fallback engine.")
            fallback_actions = DeterministicSafetyEngine.generate_deterministic_fallback(
                evidence, request.activity_context, eligible_action_ids, "Gemini API key not configured", telemetry_usable=True
            )
            if evidence.weather_usable:
                summary_text = (
                    f"Air quality is characterized by {evidence.source_type.value.lower()} data. "
                    f"Dispersion conditions are {evidence.dispersion_conditions.lower()}."
                )
                supporting_factors = [
                    f"Dispersion: {evidence.dispersion_conditions}",
                    f"Stagnation Risk: {evidence.stagnation_risk}",
                    f"Data Source: {evidence.source_type.value}"
                ]
            else:
                summary_text = (
                    f"Air quality is characterized by {evidence.source_type.value.lower()} data. "
                    "Weather and atmospheric dispersion telemetry are currently unavailable."
                )
                supporting_factors = [
                    "Weather dispersion telemetry unavailable",
                    f"Data Source: {evidence.source_type.value}"
                ]
            return AIInsightResponse(
                location=evidence.location,
                activity_context=request.activity_context,
                status=AIGenerationStatus.FALLBACK_NO_API_KEY,
                model_id=None,
                prompt_version=PROMPT_VERSION,
                generated_at=now_utc,
                summary=summary_text,
                explanation=(
                    "Guidance generated via deterministic rule engine because Google Gemini API key is not configured. "
                    "All recommendations adhere to verified environmental safety constraints."
                ),
                supporting_factors=supporting_factors,
                recommended_actions=fallback_actions,
                evidence_context=evidence.evidence_items,
                source_classification=evidence.source_type,
                quality_status=evidence.quality_status,
                retrieval_freshness=evidence.retrieval_freshness,
                limitations=evidence.limitations,
                fallback_reason="Google Gemini API key is unconfigured (GEMINI_API_KEY environment variable is unset)."
            )

        # STAGE E: Google Gemini Structured Synthesis
        prompt = build_insight_prompt(
            evidence=evidence,
            activity_context=request.activity_context,
            eligible_action_ids=eligible_action_ids,
            safety_rules=safety_rules
        )

        try:
            synthesis = await self.gemini_service.generate_structured_insights(prompt)
        except Exception as exc:
            logger.warning("Gemini synthesis failed, engaging deterministic safe fallback: %s", str(exc))
            fallback_actions = DeterministicSafetyEngine.generate_deterministic_fallback(
                evidence, request.activity_context, eligible_action_ids, f"Model error: {str(exc)}", telemetry_usable=True
            )
            if evidence.weather_usable:
                model_err_supporting = [
                    f"Dispersion: {evidence.dispersion_conditions}",
                    f"Stagnation Risk: {evidence.stagnation_risk}"
                ]
            else:
                model_err_supporting = [
                    f"Data Source: {evidence.source_type.value}",
                    "Weather dispersion telemetry unavailable"
                ]

            return AIInsightResponse(
                location=evidence.location,
                activity_context=request.activity_context,
                status=AIGenerationStatus.FALLBACK_MODEL_ERROR,
                model_id=settings.GEMINI_MODEL,
                prompt_version=PROMPT_VERSION,
                generated_at=now_utc,
                summary="Real-time model synthesis encountered a temporary error; displaying deterministic safe guidance.",
                explanation=(
                    "The generative synthesis service experienced a transient error or timeout. "
                    "Deterministic environmental safety rules remain fully active to protect user health."
                ),
                supporting_factors=model_err_supporting,
                recommended_actions=fallback_actions,
                evidence_context=evidence.evidence_items,
                source_classification=evidence.source_type,
                quality_status=evidence.quality_status,
                retrieval_freshness=evidence.retrieval_freshness,
                limitations=evidence.limitations,
                fallback_reason=f"Gemini API generation error: {str(exc)}"
            )

        # STAGE F: Post-Generation Semantic Validation & Constraint Enforcement
        valid_evidence_items = {
            k: v for k, v in evidence.evidence_items.items()
            if v.freshness in (FreshnessStatus.FRESH, FreshnessStatus.RECENT)
        }
        is_valid, validation_err = DeterministicSafetyEngine.validate_synthesized_response(
            recommended_actions=synthesis.recommended_actions,
            eligible_action_ids=eligible_action_ids,
            valid_evidence_items=valid_evidence_items,
            summary=synthesis.summary,
            explanation=synthesis.explanation,
            supporting_factors=synthesis.supporting_factors,
            uncertainty_and_limitations=synthesis.uncertainty_and_limitations,
            evidence_context=evidence
        )

        if not is_valid:
            logger.warning("Gemini response failed post-generation semantic validation: %s", validation_err)
            fallback_actions = DeterministicSafetyEngine.generate_deterministic_fallback(
                evidence, request.activity_context, eligible_action_ids, f"Validation failure: {validation_err}", telemetry_usable=True
            )
            val_err_supporting = ["Deterministic safety override triggered"]
            if evidence.weather_usable:
                val_err_supporting.append(f"Dispersion: {evidence.dispersion_conditions}")
            else:
                val_err_supporting.append("Weather dispersion telemetry unavailable")

            return AIInsightResponse(
                location=evidence.location,
                activity_context=request.activity_context,
                status=AIGenerationStatus.FALLBACK_VALIDATION_ERROR,
                model_id=settings.GEMINI_MODEL,
                prompt_version=PROMPT_VERSION,
                generated_at=now_utc,
                summary="AI response failed safety boundary validation; returning verified deterministic recommendations.",
                explanation=(
                    f"The generative model produced guidance that conflicted with deterministic safety criteria: {validation_err}. "
                    "Deterministic rules have overridden the output to ensure environmental safety and scientific accuracy."
                ),
                supporting_factors=val_err_supporting,
                recommended_actions=fallback_actions,
                evidence_context=evidence.evidence_items,
                source_classification=evidence.source_type,
                quality_status=evidence.quality_status,
                retrieval_freshness=evidence.retrieval_freshness,
                limitations=evidence.limitations + [f"AI validation filter: {validation_err}"],
                fallback_reason=validation_err
            )

        # STAGE G: Validated Success Delivery with Canonical Action Reconstruction
        logger.info("Successfully synthesized and validated AI environmental insights with Gemini.")
        all_limitations = list(evidence.limitations)
        if synthesis.uncertainty_and_limitations:
            all_limitations.append(synthesis.uncertainty_and_limitations)

        # Reconstruct actions strictly from authoritative CANONICAL_ACTIONS catalog
        reconstructed_actions: List[AIInsightAction] = []
        for action in synthesis.recommended_actions:
            canonical = CANONICAL_ACTIONS[action.action_id]
            reconstructed_actions.append(
                AIInsightAction(
                    action_id=canonical.action_id,
                    category=canonical.category,
                    priority=canonical.priority,
                    title=canonical.title,
                    rationale=canonical.rationale,
                    evidence_ids=action.evidence_ids
                )
            )

        return AIInsightResponse(
            location=evidence.location,
            activity_context=request.activity_context,
            status=AIGenerationStatus.GENERATED,
            model_id=settings.GEMINI_MODEL,
            prompt_version=PROMPT_VERSION,
            generated_at=now_utc,
            summary=synthesis.summary,
            explanation=synthesis.explanation,
            supporting_factors=synthesis.supporting_factors,
            recommended_actions=reconstructed_actions,
            evidence_context=evidence.evidence_items,
            source_classification=evidence.source_type,
            quality_status=evidence.quality_status,
            retrieval_freshness=evidence.retrieval_freshness,
            limitations=all_limitations,
            fallback_reason=None
        )


ai_service = AIService()
