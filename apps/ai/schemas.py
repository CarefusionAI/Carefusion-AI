"""Shared request/response models for the CareFusion AI service.

IMPORTANT: In the alpha, every output of this service is SIMULATED.
Nothing here is a real model result and nothing here may be used clinically.
All responses carry the "simulated AI output" label and the disclaimer below.
AI is decision support only: a doctor must review every output before a citizen
can see it (CLAUDE.md rule 3).
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

DISCLAIMER = "SIMULATED AI OUTPUT - Not for clinical use"
SIMULATED_LABEL = "simulated AI output"
SERVICE_VERSION = "0.1.0"


# --------------------------------------------------------------------------
# Enums
# --------------------------------------------------------------------------
class AIConfidence(str, Enum):
    """Confidence levels used across all four modules (from the paper)."""

    VERIFIED = "VERIFIED"
    SUPPORTED_WITH_CAUTION = "SUPPORTED_WITH_CAUTION"
    UNCERTAIN = "UNCERTAIN"


# --------------------------------------------------------------------------
# Building blocks
# --------------------------------------------------------------------------
class EvidenceSource(BaseModel):
    """One piece of supporting evidence. All sources are simulated citations."""

    source: str = Field(description="Name of the (simulated) evidence source")
    detail: str = Field(description="What the source says, in plain words")


class AISuggestion(BaseModel):
    """A single ranked suggestion. Suggestions are never a diagnosis."""

    rank: int = Field(ge=1, le=3, description="1 = top suggestion")
    suggestion: str = Field(description="Suggestion text")
    confidence: AIConfidence
    confidence_score: float = Field(
        ge=0.0, le=1.0, description="Simulated score behind the confidence level"
    )
    evidence: list[EvidenceSource] = Field(default_factory=list)
    reasoning: str = Field(description="Short plain-English reasoning (simulated)")


class DisagreementReport(BaseModel):
    """Reported when modules (or sub-models inside a module) conflict."""

    has_disagreement: bool
    modules_compared: list[str] = Field(default_factory=list)
    summary: str
    details: list[str] = Field(default_factory=list)
    recommended_action: str = "Doctor to review the conflicting outputs before acting."


class AIResponse(BaseModel):
    """Common wrapper returned by every module."""

    model_config = ConfigDict(protected_namespaces=())

    module: str = Field(description="symptom | image | genomic | temporal")
    label: str = SIMULATED_LABEL
    simulated: bool = True
    disclaimer: str = DISCLAIMER
    suggestions: list[AISuggestion]
    model_version: str
    timestamp: datetime
    disagreement_report: DisagreementReport | None = None
    requires_doctor_review: bool = True
    reviewed_by_doctor: bool = False


# --------------------------------------------------------------------------
# Guard: no raw Aadhaar anywhere (CLAUDE.md rule 2)
# --------------------------------------------------------------------------
def _reject_aadhaar(value: Any) -> None:
    """Raise ValueError if a dict (at any depth) has an Aadhaar-looking key."""
    if isinstance(value, dict):
        for key, inner in value.items():
            if "aadhaar" in str(key).lower() or "aadhar" in str(key).lower():
                raise ValueError(
                    "Raw Aadhaar is not accepted. Send a token or DEMO identifier instead."
                )
            _reject_aadhaar(inner)
    elif isinstance(value, list):
        for item in value:
            _reject_aadhaar(item)


# --------------------------------------------------------------------------
# Symptom module
# --------------------------------------------------------------------------
class SymptomRequest(BaseModel):
    symptoms: list[str] = Field(min_length=1, max_length=30)
    patient_context: dict[str, Any] = Field(
        default_factory=dict,
        description="Synthetic context only, e.g. age, sex, region, known conditions",
    )

    @field_validator("symptoms")
    @classmethod
    def _clean_symptoms(cls, v: list[str]) -> list[str]:
        cleaned = [s.strip() for s in v if s and s.strip()]
        if not cleaned:
            raise ValueError("At least one non-empty symptom is required")
        return cleaned

    @field_validator("patient_context")
    @classmethod
    def _no_aadhaar(cls, v: dict[str, Any]) -> dict[str, Any]:
        _reject_aadhaar(v)
        return v


class SymptomResponse(AIResponse):
    module: str = "symptom"
    red_flags: list[str] = Field(
        default_factory=list, description="Simulated warning signs for a doctor to check"
    )


# --------------------------------------------------------------------------
# Image module
# --------------------------------------------------------------------------
class ImageResponse(AIResponse):
    module: str = "image"
    filename: str | None = None
    content_type: str | None = None
    size_bytes: int = 0
    file_sha256: str = Field(description="SHA-256 of the upload; the file itself is not stored")
    modality_guess: str = "unknown (simulated)"


# --------------------------------------------------------------------------
# Genomic module
# --------------------------------------------------------------------------
class GenomicRequest(BaseModel):
    variants: list[dict[str, Any]] = Field(
        min_length=1,
        max_length=200,
        description='e.g. [{"gene": "CYP2C19", "rsid": "rs4244285", "genotype": "*1/*2"}]',
    )

    @field_validator("variants")
    @classmethod
    def _no_aadhaar(cls, v: list[dict[str, Any]]) -> list[dict[str, Any]]:
        _reject_aadhaar(v)
        return v


class PharmacogenomicFinding(BaseModel):
    gene: str
    genotype: str | None = None
    drug: str
    indian_brand_examples: list[str] = Field(default_factory=list)
    implication: str
    confidence: AIConfidence


class RiskFinding(BaseModel):
    condition: str
    gene: str | None = None
    relative_risk: str = Field(description="Plain-words risk band (simulated)")
    confidence: AIConfidence


class GenomicResponse(AIResponse):
    module: str = "genomic"
    pharmacogenomic_findings: list[PharmacogenomicFinding] = Field(default_factory=list)
    risk_findings: list[RiskFinding] = Field(default_factory=list)
    variants_received: int = 0
    variants_recognised: int = 0


# --------------------------------------------------------------------------
# Temporal (vitals trend) module
# --------------------------------------------------------------------------
class TemporalRequest(BaseModel):
    vitals_history: list[dict[str, Any]] = Field(
        min_length=1,
        max_length=1000,
        description=(
            'Oldest first. Keys: timestamp, systolic, diastolic, heart_rate, spo2, '
            'temperature_c, glucose_mg_dl (all optional per reading)'
        ),
    )

    @field_validator("vitals_history")
    @classmethod
    def _no_aadhaar(cls, v: list[dict[str, Any]]) -> list[dict[str, Any]]:
        _reject_aadhaar(v)
        return v


class MetricTrend(BaseModel):
    metric: str
    readings_used: int
    first_half_mean: float
    second_half_mean: float
    change_percent: float
    direction: str = Field(description="rising | falling | stable")


class TemporalResponse(AIResponse):
    module: str = "temporal"
    readings_received: int = 0
    trends: list[MetricTrend] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Helpers shared by the routers
# --------------------------------------------------------------------------
def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def seeded_int(*parts: object) -> int:
    """Deterministic integer from the inputs, so the same input gives the same
    simulated output (stable demos, stable tests). Not cryptographic use."""
    digest = hashlib.sha256("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()
    return int(digest[:12], 16)


def level_from_score(score: float) -> AIConfidence:
    """Map a simulated score to a confidence level."""
    if score >= 0.80:
        return AIConfidence.VERIFIED
    if score >= 0.50:
        return AIConfidence.SUPPORTED_WITH_CAUTION
    return AIConfidence.UNCERTAIN
