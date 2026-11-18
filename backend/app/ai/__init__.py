"""AI Intelligence Engine package exports."""
from .prompt_manager import PROMPT_VERSION, SYSTEM_INSTRUCTION, build_insight_prompt
from .gemini_service import GeminiService, gemini_service

__all__ = [
    "PROMPT_VERSION",
    "SYSTEM_INSTRUCTION",
    "build_insight_prompt",
    "GeminiService",
    "gemini_service"
]
