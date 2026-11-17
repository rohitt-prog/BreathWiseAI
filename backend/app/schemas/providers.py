"""Provider status and health schemas."""
from typing import List
from datetime import datetime
from pydantic import BaseModel, Field
from .common import DataClassification


class ProviderStatusItem(BaseModel):
    """Operational status descriptor for an environmental telemetry provider."""
    provider_id: str
    name: str
    configured: bool
    status: str = Field(..., description="OPERATIONAL, NOT_CONFIGURED, UNAVAILABLE, or PENDING_VERIFICATION")
    classification: DataClassification
    description: str
    coverage: str
    notes: str


class ProvidersStatusResponse(BaseModel):
    """Aggregate status of all environmental providers."""
    retrieved_at: datetime
    providers: List[ProviderStatusItem]
