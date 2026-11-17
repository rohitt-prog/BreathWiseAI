"""Custom application exceptions with standardized error details."""
from typing import Optional, Dict, Any
from datetime import datetime, timezone


class BreatheWiseException(Exception):
    """Base exception for BreatheWise AI."""
    def __init__(self, message: str, status_code: int = 500, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        self.timestamp = datetime.now(timezone.utc).isoformat()


class CoordinateValidationError(BreatheWiseException):
    """Raised when latitude or longitude is invalid or out of geographic bounds."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, status_code=400, details=details)


class ProviderUnavailableError(BreatheWiseException):
    """Raised when an environmental telemetry provider cannot be reached or times out."""
    def __init__(self, provider: str, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"Provider '{provider}' is temporarily unavailable: {message}",
            status_code=503,
            details=details or {"provider": provider}
        )


class ProviderConfigurationError(BreatheWiseException):
    """Raised when a requested provider is not configured."""
    def __init__(self, provider: str, message: str):
        super().__init__(
            message=f"Provider '{provider}' is not configured: {message}",
            status_code=501,
            details={"provider": provider, "status": "NOT_CONFIGURED"}
        )
