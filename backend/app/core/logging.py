"""Safe structured logging utility that redacts sensitive credentials and keys."""
import logging
import re
from typing import Any
from .config import settings

# Patterns for sensitive keys in query strings or headers
SENSITIVE_PATTERNS = [
    (re.compile(r"(?i)(api[_-]?key|token|auth|secret)=([a-zA-Z0-9_\-]+)"), r"\1=[REDACTED]"),
    (re.compile(r"(?i)(X-API-Key:\s*)([a-zA-Z0-9_\-]+)"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(Bearer\s+)([a-zA-Z0-9_\-\.]+)"), r"\1[REDACTED]"),
]


def sanitize_log_message(msg: str) -> str:
    """Sanitize any potential API keys or tokens from log text."""
    for pattern, replacement in SENSITIVE_PATTERNS:
        msg = pattern.sub(replacement, msg)
    return msg


class SafeLogFilter(logging.Filter):
    """Logging filter that scrubs sensitive credentials from all records."""
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = sanitize_log_message(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: (sanitize_log_message(str(v)) if isinstance(v, str) else v) for k, v in record.args.items()}
            elif isinstance(record.args, tuple):
                record.args = tuple(sanitize_log_message(str(a)) if isinstance(a, str) else a for a in record.args)
        return True


def setup_logging() -> logging.Logger:
    """Configure structured, sanitized logging for BreatheWise AI."""
    logger = logging.getLogger("breathewise")
    logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))

    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            fmt="[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        handler.setFormatter(formatter)
        handler.addFilter(SafeLogFilter())
        logger.addHandler(handler)

    return logger


logger = setup_logging()
