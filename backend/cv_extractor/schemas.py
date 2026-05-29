from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# OWASP: Enforce max_length on all user-facing string fields
_MAX_NAME = 180
_MAX_EMAIL = 254
_MAX_PHONE = 40
_MAX_INSTITUTION = 200
_MAX_DISCIPLINE = 120
_MAX_EXAM_SCORES = 120
_MAX_CONTROLLED_ID = 80
_MAX_CONTROLLED_LABEL = 200
_MAX_RAW_TEXT = 500
_MAX_FIELD_PATH = 200
_MAX_ISSUE_MESSAGE = 500
_MAX_SUGGESTED_VALUE = 200
_MAX_FILENAME = 180
_MAX_MIME_TYPE = 120
_MAX_STRATEGY = 60
_MAX_PROVIDER = 60
_MAX_MODEL = 80
_MAX_ERROR_MESSAGE = 500
_MAX_USER_ACTION = 500
_MAX_ERROR_DETAIL = 2000
_MAX_DESCRIPTION = 5000
_MAX_CV_TEXT = 20000


class StrictBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ParseJobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"


class ParsePhase(str, Enum):
    QUEUED = "queued"
    VALIDATING_FILE = "validating_file"
    EXTRACTING_TEXT = "extracting_text"
    ANALYZING_ACADEMICS = "analyzing_academics"
    NORMALIZING_FIELDS = "normalizing_fields"
    STAGING_PROFILE = "staging_profile"
    COMPLETE = "complete"
    FAILED = "failed"


class ErrorCode(str, Enum):
    ERR_UNSUPPORTED_FILE_TYPE = "ERR_UNSUPPORTED_FILE_TYPE"
    ERR_FILE_TOO_LARGE = "ERR_FILE_TOO_LARGE"
    ERR_EMPTY_UPLOAD = "ERR_EMPTY_UPLOAD"
    ERR_PDF_ENCRYPTED = "ERR_PDF_ENCRYPTED"
    ERR_PDF_CORRUPTED = "ERR_PDF_CORRUPTED"
    ERR_PDF_NO_TEXT = "ERR_PDF_NO_TEXT"
    ERR_EXTRACTION_TIMEOUT = "ERR_EXTRACTION_TIMEOUT"
    ERR_LLM_UNAVAILABLE = "ERR_LLM_UNAVAILABLE"
    ERR_LLM_INVALID_OUTPUT = "ERR_LLM_INVALID_OUTPUT"
    ERR_STAGE_NOT_FOUND = "ERR_STAGE_NOT_FOUND"
    ERR_JOB_NOT_FOUND = "ERR_JOB_NOT_FOUND"
    ERR_INTERNAL = "ERR_INTERNAL"


class DegreeType(str, Enum):
    BSC = "BSc"
    MSC = "MSc"
    PHD = "PhD"
    DIPLOMA = "Diploma"
    OTHER = "Other"


class DegreeClassId(str, Enum):
    FIRST_CLASS = "first_class"
    SECOND_UPPER = "second_upper"
    SECOND_LOWER = "second_lower"
    THIRD_CLASS = "third_class"
    DISTINCTION = "distinction"
    MERIT = "merit"
    PASS = "pass"
    CGPA = "cgpa"
    GPA = "gpa"
    OTHER = "other"


class ControlledValue(StrictBaseModel):
    id: str | None = Field(default=None, max_length=_MAX_CONTROLLED_ID, description="Stable enum or ontology identifier.")
    label: str | None = Field(default=None, max_length=_MAX_CONTROLLED_LABEL, description="Frontend-safe display label.")
    raw_text: str | None = Field(default=None, max_length=_MAX_RAW_TEXT, description="Original extracted text before normalization.")


class FieldIssue(StrictBaseModel):
    field_path: str = Field(max_length=_MAX_FIELD_PATH, description="Dot path to the field inside profile, e.g. academic_history.0.degree_class.")
    message: str = Field(max_length=_MAX_ISSUE_MESSAGE)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    raw_text: str | None = Field(default=None, max_length=_MAX_RAW_TEXT)
    suggested_value: str | None = Field(default=None, max_length=_MAX_SUGGESTED_VALUE)


class PersonalDetails(StrictBaseModel):
    full_legal_name: str | None = Field(default=None, max_length=_MAX_NAME)
    email: str | None = Field(default=None, max_length=_MAX_EMAIL)
    phone: str | None = Field(default=None, max_length=_MAX_PHONE)
    nationality: ControlledValue | None = None


class AcademicHistoryItem(StrictBaseModel):
    institution: str | None = Field(default=None, max_length=_MAX_INSTITUTION)
    degree_type: DegreeType | None = None
    academic_discipline: str | None = Field(default=None, max_length=_MAX_DISCIPLINE)
    graduation_year: int | None = Field(default=None, ge=1900, le=2100)
    degree_class: ControlledValue | None = None


class InternationalExams(StrictBaseModel):
    ielts_taken: bool | None = None
    ielts_band_score: float | None = Field(default=None, ge=0.0, le=9.0)
    gre_gmat_scores: str | None = Field(default=None, max_length=_MAX_EXAM_SCORES)


class CandidateProfile(StrictBaseModel):
    personal_details: PersonalDetails = Field(default_factory=PersonalDetails)
    academic_history: list[AcademicHistoryItem] = Field(default_factory=list)
    international_exams: InternationalExams = Field(default_factory=InternationalExams)


class ExtractionMetadata(StrictBaseModel):
    overall_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    parsing_notes: list[str] = Field(default_factory=list)
    source_filename: str | None = Field(default=None, max_length=_MAX_FILENAME)
    source_mime_type: str | None = Field(default=None, max_length=_MAX_MIME_TYPE)
    extracted_characters: int = Field(default=0, ge=0)
    parser_strategy: str | None = Field(default=None, max_length=_MAX_STRATEGY)
    provider: str | None = Field(default=None, max_length=_MAX_PROVIDER)
    model: str | None = Field(default=None, max_length=_MAX_MODEL)
    completed_at: datetime | None = None
    deterministic_match: "CvMatchResponse | None" = None


class ApplicationError(StrictBaseModel):
    code: ErrorCode
    message: str = Field(max_length=_MAX_ERROR_MESSAGE)
    retryable: bool = False
    user_action: str | None = Field(default=None, max_length=_MAX_USER_ACTION)
    detail: str | None = Field(default=None, max_length=_MAX_ERROR_DETAIL)


class ParseLinks(StrictBaseModel):
    status_url: str
    events_url: str
    draft_url: str


class ProfileDraftEnvelope(StrictBaseModel):
    draft_id: str
    session_id: str
    profile: CandidateProfile
    missing_fields: list[FieldIssue] = Field(default_factory=list)
    low_confidence_fields: list[FieldIssue] = Field(default_factory=list)
    metadata: ExtractionMetadata = Field(default_factory=ExtractionMetadata)
    last_job_id: str | None = None
    expires_at: datetime | None = None


class ParseJobResponse(StrictBaseModel):
    job_id: str
    draft_id: str
    session_id: str
    status: ParseJobStatus
    phase: ParsePhase
    progress: int = Field(ge=0, le=100)
    message: str
    profile: CandidateProfile | None = None
    missing_fields: list[FieldIssue] = Field(default_factory=list)
    low_confidence_fields: list[FieldIssue] = Field(default_factory=list)
    metadata: ExtractionMetadata | None = None
    error: ApplicationError | None = None
    links: ParseLinks
    updated_at: datetime


class ParseJobAccepted(StrictBaseModel):
    job: ParseJobResponse


class ParseEvent(StrictBaseModel):
    event: str
    job_id: str
    draft_id: str
    status: ParseJobStatus
    phase: ParsePhase
    progress: int = Field(ge=0, le=100)
    message: str
    updated_at: datetime
    profile: CandidateProfile | None = None
    missing_fields: list[FieldIssue] = Field(default_factory=list)
    low_confidence_fields: list[FieldIssue] = Field(default_factory=list)
    metadata: ExtractionMetadata | None = None
    error: ApplicationError | None = None


class ProfileDraftUpdateRequest(StrictBaseModel):
    profile: CandidateProfile
    missing_fields: list[FieldIssue] = Field(default_factory=list)
    low_confidence_fields: list[FieldIssue] = Field(default_factory=list)
    metadata: ExtractionMetadata | None = None


class ProfileDraftPatchRequest(StrictBaseModel):
    profile: CandidateProfile | None = None
    missing_fields: list[FieldIssue] | None = None
    low_confidence_fields: list[FieldIssue] | None = None
    metadata: ExtractionMetadata | None = None


class LLMExtractionResult(StrictBaseModel):
    profile: CandidateProfile
    missing_fields: list[FieldIssue] = Field(default_factory=list)
    low_confidence_fields: list[FieldIssue] = Field(default_factory=list)
    metadata: ExtractionMetadata = Field(default_factory=ExtractionMetadata)


class CvMatchCriteria(StrictBaseModel):
    min_graduation_year: int | None = Field(default=None, ge=1900, le=2100)
    acceptable_degree_classes: list[str] = Field(default_factory=list)
    job_or_scholarship_description: str = Field(max_length=_MAX_DESCRIPTION)


class CvMatchExtractedMetadata(StrictBaseModel):
    graduation_year: int | None = Field(default=None, ge=1900, le=2100)
    degree_classification: str = "None"
    detected_disciplines: list[str] = Field(default_factory=list)
    detected_skills: list[str] = Field(default_factory=list)
    detected_exams: list[str] = Field(default_factory=list)
    parser_strategy: str = "section_weighted"


class CvMatchRequest(StrictBaseModel):
    raw_cv_text: str = Field(max_length=_MAX_CV_TEXT)
    criteria: CvMatchCriteria


class CvMatchResponse(StrictBaseModel):
    is_eligible: bool
    match_confidence_score: float = Field(ge=0.0, le=100.0)
    extracted_metadata: CvMatchExtractedMetadata
    compliance_flags: list[str] = Field(default_factory=list)
    matched_signals: list[str] = Field(default_factory=list)
    missing_signals: list[str] = Field(default_factory=list)
    scoring_breakdown: dict[str, float] = Field(default_factory=dict)


class JobRecord(StrictBaseModel):
    job_id: str
    draft_id: str
    session_id: str
    status: ParseJobStatus
    phase: ParsePhase
    progress: int
    message: str
    profile: CandidateProfile | None = None
    missing_fields: list[FieldIssue] = Field(default_factory=list)
    low_confidence_fields: list[FieldIssue] = Field(default_factory=list)
    metadata: ExtractionMetadata | None = None
    error: ApplicationError | None = None
    celery_task_id: str | None = None
    created_at: datetime
    updated_at: datetime
    expires_at: datetime


class DraftRecord(StrictBaseModel):
    draft_id: str
    session_id: str
    profile: CandidateProfile
    missing_fields: list[FieldIssue] = Field(default_factory=list)
    low_confidence_fields: list[FieldIssue] = Field(default_factory=list)
    metadata: ExtractionMetadata = Field(default_factory=ExtractionMetadata)
    last_job_id: str | None = None
    created_at: datetime
    updated_at: datetime
    expires_at: datetime


def deep_merge_model(base: BaseModel, patch: BaseModel | dict[str, Any]) -> BaseModel:
    patch_payload = patch if isinstance(patch, dict) else patch.model_dump(exclude_none=True)
    merged = _deep_merge_dicts(base.model_dump(), patch_payload)
    return base.__class__.model_validate(merged)


def _deep_merge_dicts(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    merged = dict(left)
    for key, value in right.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge_dicts(merged[key], value)
        else:
            merged[key] = value
    return merged
