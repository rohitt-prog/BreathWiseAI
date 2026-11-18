"""Google Gemini integration service using the official google-genai SDK."""
import asyncio
from typing import Optional
from google import genai
from google.genai import types, errors

from ..core.config import settings
from ..core.logging import logger
from ..schemas.ai import AIStructuredSynthesis
from .prompt_manager import SYSTEM_INSTRUCTION


class GeminiService:
    """Service encapsulating Google GenAI SDK client lifecycle and async generation."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        default_model: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        client: Optional[genai.Client] = None
    ):
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._default_model = default_model or settings.GEMINI_MODEL
        self._timeout_seconds = timeout_seconds or settings.GEMINI_TIMEOUT_SECONDS
        self._client = client

    def is_configured(self) -> bool:
        """Check if Gemini API key is configured."""
        return bool(self._api_key and self._api_key.strip())

    def get_client(self) -> genai.Client:
        """Return or lazily initialize the singleton GenAI client."""
        if self._client is None:
            if not self.is_configured():
                raise ValueError("Gemini API key is not configured.")
            self._client = genai.Client(api_key=self._api_key)
        return self._client

    async def generate_structured_insights(
        self,
        prompt: str,
        model: Optional[str] = None,
        timeout: Optional[float] = None
    ) -> AIStructuredSynthesis:
        """Generate structured environmental insights using Gemini SDK with Pydantic schema enforcement.

        Raises:
            asyncio.TimeoutError: On request timeout.
            errors.APIError: On Gemini API failure or quota exhaustion.
            ValueError: On safety refusal, empty response, or schema parsing error.
        """
        client = self.get_client()
        target_model = model or self._default_model
        req_timeout = timeout or self._timeout_seconds

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=AIStructuredSynthesis,
            system_instruction=SYSTEM_INSTRUCTION,
            temperature=0.2,
            max_output_tokens=1024
        )

        logger.info(
            "Invoking Gemini model '%s' for structured synthesis (timeout: %.1fs)",
            target_model,
            req_timeout
        )

        try:
            call_coro = client.aio.models.generate_content(
                model=target_model,
                contents=prompt,
                config=config
            )
            response: types.GenerateContentResponse = await asyncio.wait_for(
                call_coro,
                timeout=req_timeout
            )
        except asyncio.TimeoutError as exc:
            logger.warning("Gemini API request timed out after %.1f seconds", req_timeout)
            raise asyncio.TimeoutError(f"Gemini API request timed out after {req_timeout}s") from exc
        except errors.APIError as exc:
            logger.error("Gemini API error (%s): %s", getattr(exc, "code", "UNKNOWN"), getattr(exc, "message", str(exc)))
            raise exc
        except Exception as exc:
            logger.error("Unexpected error invoking Gemini SDK: %s", str(exc))
            raise exc

        # Check for safety refusals or empty candidate list
        if not response.candidates:
            raise ValueError("Gemini returned zero response candidates.")

        candidate = response.candidates[0]
        finish_reason = getattr(candidate, "finish_reason", None)
        if finish_reason and "SAFETY" in str(finish_reason).upper():
            logger.warning("Gemini synthesis refused due to safety rating: %s", finish_reason)
            raise ValueError(f"Generation refused by model safety filters: {finish_reason}")

        text_content = response.text
        if not text_content or not text_content.strip():
            raise ValueError("Gemini returned empty text content.")

        # Parse and validate with Pydantic
        try:
            structured = AIStructuredSynthesis.model_validate_json(text_content)
            return structured
        except Exception as exc:
            logger.error("Failed to parse Gemini output against AIStructuredSynthesis: %s", str(exc))
            raise ValueError(f"Gemini output failed schema validation: {str(exc)}") from exc


gemini_service = GeminiService()
