"""Prompt engineering and versioning for BreatheWise AI Intelligence Engine."""
import json
from typing import List, Set
from ..schemas.common import FreshnessStatus
from ..schemas.ai import ActivityContext, EnvironmentalEvidenceContext
from ..services.deterministic_safety import CANONICAL_ACTIONS

PROMPT_VERSION = "v1.0.0"

SYSTEM_INSTRUCTION = """You are the BreatheWise AI Environmental Intelligence Assistant.
Your mission is to translate validated atmospheric telemetry into concise, scientifically rigorous, and actionable guidance.

CORE OPERATIONAL PRINCIPLES:
1. Ground every claim strictly in the provided Environmental Evidence.
2. NEVER invent, infer, or hallucinate missing pollutants, sensor readings, or station locations.
3. NEVER interpret a modelled forecast (e.g. Open-Meteo CAMS) as a physical sensor observation.
4. NEVER calculate, estimate, or present an official Indian NAQI unless it is explicitly marked as verified in the evidence.
5. NEVER claim that an instantaneous or hourly modelled concentration violates or exceeds the 24-hour statutory Indian NAAQS standard.
6. You MUST select actions EXCLUSIVELY from the provided Eligible Actions list using their exact action_id and category.
7. Every telemetry-dependent action MUST cite valid, relevant Evidence IDs from the provided Evidence Context.
8. Comply strictly with all Mandatory Safety Constraints.

OUTPUT FORMAT:
Return structured JSON matching the requested schema.
"""


def build_insight_prompt(
    evidence: EnvironmentalEvidenceContext,
    activity_context: ActivityContext,
    eligible_action_ids: Set[str],
    safety_rules: List[str]
) -> str:
    """Construct versioned, evidence-grounded prompt for Gemini synthesis."""
    # Filter to only fresh/recent evidence items
    fresh_evidence_items = {
        eid: {
            "parameter": item.parameter,
            "value": item.value,
            "unit": item.unit,
            "classification": item.classification.value,
            "context_note": item.context_note
        }
        for eid, item in evidence.evidence_items.items()
        if item.freshness in (FreshnessStatus.FRESH, FreshnessStatus.RECENT)
    }

    evidence_payload = {
        "location": {
            "latitude": evidence.location.latitude,
            "longitude": evidence.location.longitude,
            "name": evidence.location.name or f"Coordinates ({evidence.location.latitude}, {evidence.location.longitude})"
        },
        "telemetry_source": {
            "source_type": evidence.source_type.value,
            "quality_status": evidence.quality_status.value,
            "retrieval_freshness": evidence.retrieval_freshness.value,
            "observation_freshness": evidence.observation_freshness.value if evidence.observation_freshness else None,
            "forecast_validity": evidence.forecast_validity.value if evidence.forecast_validity else None
        },
        "weather_provenance": {
            "source_type": evidence.weather_source_type.value if evidence.weather_source_type else None,
            "retrieval_freshness": evidence.weather_retrieval_freshness.value if evidence.weather_retrieval_freshness else None,
            "forecast_validity": evidence.weather_forecast_validity.value if evidence.weather_forecast_validity else None,
            "usable": evidence.weather_usable
        },
        "evidence_items": fresh_evidence_items,
        "limitations": evidence.limitations
    }

    # Only include atmospheric_physics when weather is verified usable
    if evidence.weather_usable:
        evidence_payload["atmospheric_physics"] = {
            "stagnation_risk": evidence.stagnation_risk,
            "dispersion_conditions": evidence.dispersion_conditions
        }

    # 2. Eligible action catalog available for this request
    eligible_actions_payload = [
        {
            "action_id": aid,
            "category": CANONICAL_ACTIONS[aid].category.value,
            "title": CANONICAL_ACTIONS[aid].title,
            "guideline": CANONICAL_ACTIONS[aid].rationale,
            "required_evidence_keys": list(CANONICAL_ACTIONS[aid].required_evidence_keys)
        }
        for aid in eligible_action_ids
        if aid in CANONICAL_ACTIONS
    ]

    prompt = f"""
### ENVIRONMENTAL EVIDENCE CONTEXT:
{json.dumps(evidence_payload, indent=2)}

### USER ACTIVITY CONTEXT:
Focus area: {activity_context.value}

### ELIGIBLE ACTION CATALOG (Choose 2-3 actions STRICTLY from this list):
{json.dumps(eligible_actions_payload, indent=2)}

### MANDATORY SAFETY CONSTRAINTS:
{chr(10).join(f"- {rule}" for rule in safety_rules)}

### TASK:
1. Provide a concise environmental summary (1-2 sentences).
2. Provide a plain-language explanation of current air quality and boundary layer dispersion dynamics.
3. Highlight 2-3 supporting environmental factors.
4. Select 2-3 appropriate recommended actions from the Eligible Action Catalog. Each action must preserve the exact action_id and category, cite supporting evidence IDs, and adhere to canonical guidance.
5. Explicitly acknowledge scientific uncertainty and telemetry limitations.
"""
    return prompt.strip()
