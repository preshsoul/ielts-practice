from __future__ import annotations

import asyncio
import logging
import os
import secrets
from typing import AsyncIterator
from uuid import uuid4

from fastapi import Cookie, FastAPI, File, Form, Request, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from backend.cv_extractor.app_errors import CVExtractorError
from backend.cv_extractor.job_store import StageStore, utcnow
from backend.cv_extractor.security import (
    CacheStore,
    RateLimiter,
    apply_security_headers,
    build_rate_limit_response,
    make_rate_limit_key,
)
from backend.cv_extractor.schemas import (
    ApplicationError,
    CandidateProfile,
    CvMatchCriteria,
    CvMatchRequest,
    CvMatchResponse,
    DraftRecord,
    ErrorCode,
    ExtractionMetadata,
    ParseEvent,
    ParseJobAccepted,
    ParseJobResponse,
    ParseJobStatus,
    ParseLinks,
    ParsePhase,
    ProfileDraftEnvelope,
    ProfileDraftPatchRequest,
    ProfileDraftUpdateRequest,
    JobRecord,
    deep_merge_model,
)
from backend.cv_extractor.services.llm_service import (
    LLMExtractionError,
    extract_structured_data_from_text,
)
from backend.cv_extractor.services.document_service import DocumentExtractionError, extract_text_from_document
from backend.cv_extractor.services.matcher_service import matcher
from backend.cv_extractor.streaming import EventBroker

USE_CELERY = os.getenv("CV_USE_CELERY", "false").strip().lower() == "true"
if USE_CELERY:
    from backend.cv_extractor.tasks import parse_document


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

APP_VERSION = "2.0.0"
SESSION_COOKIE_NAME = "cv_parse_session"
MAX_UPLOAD_BYTES = int(os.getenv("CV_MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))
SESSION_TTL_MINUTES = int(os.getenv("CV_STAGE_TTL_MINUTES", "60"))
COOKIE_SECURE = os.getenv("CV_COOKIE_SECURE", "false").strip().lower() == "true"
MAX_MATCH_CRITERIA_BYTES = int(os.getenv("CV_MAX_MATCH_CRITERIA_BYTES", "32768"))
ALLOWED_DOCUMENT_TYPES = {
    "application/pdf",
    "application/x-pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-word.document.macroEnabled.12",
    "text/plain",
    "text/markdown",
    "text/csv",
}

app = FastAPI(
    title="LOCI CV Extraction Service",
    version=APP_VERSION,
)
allowed_origins = [
    origin.strip()
    for origin in os.getenv("APP_ORIGIN", "http://localhost:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
store = StageStore(ttl_minutes=SESSION_TTL_MINUTES)
broker = EventBroker()
rate_limiter = RateLimiter()
cache_store = CacheStore()


@app.middleware("http")
async def add_default_security_headers(request: Request, call_next):
    response = await call_next(request)
    cache_control = "public, max-age=30" if request.url.path == "/healthz" else "no-store"
    for key, value in apply_security_headers(JSONResponse({}), cache_control=cache_control).headers.items():
        response.headers.setdefault(key, value)
    return response


def _build_links(request: Request, job_id: str, draft_id: str) -> ParseLinks:
    return ParseLinks(
        status_url=str(request.url_for("get_parse_job", job_id=job_id)),
        events_url=str(request.url_for("stream_parse_job_events", job_id=job_id)),
        draft_url=str(request.url_for("get_profile_draft", draft_id=draft_id)),
    )


def _job_to_response(request: Request, record: JobRecord) -> ParseJobResponse:
    return ParseJobResponse(
        job_id=record.job_id,
        draft_id=record.draft_id,
        session_id=record.session_id,
        status=record.status,
        phase=record.phase,
        progress=record.progress,
        message=record.message,
        profile=record.profile,
        missing_fields=record.missing_fields,
        low_confidence_fields=record.low_confidence_fields,
        metadata=record.metadata,
        error=record.error,
        links=_build_links(request, record.job_id, record.draft_id),
        updated_at=record.updated_at,
    )


def _draft_to_response(record: DraftRecord) -> ProfileDraftEnvelope:
    return ProfileDraftEnvelope(
        draft_id=record.draft_id,
        session_id=record.session_id,
        profile=record.profile,
        missing_fields=record.missing_fields,
        low_confidence_fields=record.low_confidence_fields,
        metadata=record.metadata,
        last_job_id=record.last_job_id,
        expires_at=record.expires_at,
    )


def _error_payload(error: ApplicationError) -> JSONResponse:
    status_map = {
        ErrorCode.ERR_UNSUPPORTED_FILE_TYPE: status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        ErrorCode.ERR_FILE_TOO_LARGE: status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        ErrorCode.ERR_EMPTY_UPLOAD: status.HTTP_400_BAD_REQUEST,
        ErrorCode.ERR_PDF_ENCRYPTED: status.HTTP_422_UNPROCESSABLE_ENTITY,
        ErrorCode.ERR_PDF_CORRUPTED: status.HTTP_422_UNPROCESSABLE_ENTITY,
        ErrorCode.ERR_PDF_NO_TEXT: status.HTTP_422_UNPROCESSABLE_ENTITY,
        ErrorCode.ERR_EXTRACTION_TIMEOUT: status.HTTP_504_GATEWAY_TIMEOUT,
        ErrorCode.ERR_LLM_UNAVAILABLE: status.HTTP_502_BAD_GATEWAY,
        ErrorCode.ERR_LLM_INVALID_OUTPUT: status.HTTP_502_BAD_GATEWAY,
        ErrorCode.ERR_STAGE_NOT_FOUND: status.HTTP_404_NOT_FOUND,
        ErrorCode.ERR_JOB_NOT_FOUND: status.HTTP_404_NOT_FOUND,
        ErrorCode.ERR_INTERNAL: status.HTTP_500_INTERNAL_SERVER_ERROR,
    }
    return apply_security_headers(JSONResponse(
        status_code=status_map.get(error.code, status.HTTP_500_INTERNAL_SERVER_ERROR),
        content={"error": error.model_dump(mode="json")},
    ))


def _new_session_id() -> str:
    return secrets.token_urlsafe(24)


def _ensure_session(response: Response, session_id: str | None) -> str:
    resolved = session_id or _new_session_id()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=resolved,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=SESSION_TTL_MINUTES * 60,
    )
    return resolved


def _assert_session_ownership(resource_session_id: str, request_session_id: str | None) -> ApplicationError | None:
    if not request_session_id or resource_session_id != request_session_id:
        return ApplicationError(
            code=ErrorCode.ERR_STAGE_NOT_FOUND,
            message="We could not find a recoverable draft for this browser session.",
            user_action="Re-upload the CV to create a new draft for this device.",
        )
    return None


async def _publish_job_event(record: JobRecord, event_name: str = "parse.update") -> None:
    event = ParseEvent(
        event=event_name,
        job_id=record.job_id,
        draft_id=record.draft_id,
        status=record.status,
        phase=record.phase,
        progress=record.progress,
        message=record.message,
        updated_at=record.updated_at,
        profile=record.profile,
        missing_fields=record.missing_fields,
        low_confidence_fields=record.low_confidence_fields,
        metadata=record.metadata,
        error=record.error,
    )
    await broker.publish(event)


async def _transition_job(
    record: JobRecord,
    *,
    status_value: ParseJobStatus | None = None,
    phase: ParsePhase | None = None,
    progress: int | None = None,
    message: str | None = None,
    profile: CandidateProfile | None = None,
    missing_fields=None,
    low_confidence_fields=None,
    metadata: ExtractionMetadata | None = None,
    error: ApplicationError | None = None,
) -> JobRecord:
    if status_value is not None:
        record.status = status_value
    if phase is not None:
        record.phase = phase
    if progress is not None:
        record.progress = progress
    if message is not None:
        record.message = message
    if profile is not None:
        record.profile = profile
    if missing_fields is not None:
        record.missing_fields = missing_fields
    if low_confidence_fields is not None:
        record.low_confidence_fields = low_confidence_fields
    if metadata is not None:
        record.metadata = metadata
    if error is not None:
        record.error = error
    updated = store.update_job(record)
    await _publish_job_event(updated)
    return updated


async def _run_parse_job(
    record: JobRecord,
    *,
    document_bytes: bytes,
    filename: str,
    content_type: str | None,
    match_criteria: CvMatchCriteria | None = None,
) -> None:
    draft = store.get_draft(record.draft_id)
    created_at = draft.created_at if draft else utcnow()
    try:
        await _transition_job(
            record,
            status_value=ParseJobStatus.PROCESSING,
            phase=ParsePhase.VALIDATING_FILE,
            progress=10,
            message="Checking the uploaded CV before parsing starts.",
        )

        if content_type not in ALLOWED_DOCUMENT_TYPES and not filename.lower().endswith((".pdf", ".docx", ".txt", ".md", ".csv")):
            raise CVExtractorError(
                code=ErrorCode.ERR_UNSUPPORTED_FILE_TYPE,
                message="Only PDF, DOCX, and TXT CV uploads are supported right now.",
                user_action="Export the CV as a PDF, DOCX, or TXT file and upload it again.",
            )

        if not document_bytes:
            raise CVExtractorError(
                code=ErrorCode.ERR_EMPTY_UPLOAD,
                message="This upload did not contain any file data.",
                user_action="Choose the CV again and retry the upload.",
            )

        if len(document_bytes) > MAX_UPLOAD_BYTES:
            raise CVExtractorError(
                code=ErrorCode.ERR_FILE_TOO_LARGE,
                message="This document is larger than the current upload limit.",
                user_action=f"Compress the file or export a smaller document under {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
            )

        await _transition_job(
            record,
            phase=ParsePhase.EXTRACTING_TEXT,
            progress=35,
            message="Reading text from the uploaded CV document.",
        )
        document_result = await extract_text_from_document(document_bytes, filename, content_type)
        raw_text = document_result.text

        await _transition_job(
            record,
            phase=ParsePhase.ANALYZING_ACADEMICS,
            progress=70,
            message="Analyzing academic history, identity, and IELTS evidence.",
        )
        extraction = await extract_structured_data_from_text(raw_text)
        extraction.metadata.source_filename = filename
        extraction.metadata.source_mime_type = content_type
        extraction.metadata.extracted_characters = len(raw_text)
        extraction.metadata.parser_strategy = document_result.strategy
        extraction.metadata.parsing_notes.extend(document_result.notes)
        if match_criteria is not None:
            deterministic_match = await asyncio.to_thread(
                matcher.evaluate_candidate,
                raw_text,
                match_criteria,
            )
            extraction.metadata.deterministic_match = deterministic_match
            extraction.metadata.parsing_notes.append(
                f"Deterministic matcher scored this CV at {deterministic_match.match_confidence_score:.2f}%.",
            )

        await _transition_job(
            record,
            phase=ParsePhase.NORMALIZING_FIELDS,
            progress=85,
            message="Normalizing extracted fields for review-safe form rendering.",
            profile=extraction.profile,
            missing_fields=extraction.missing_fields,
            low_confidence_fields=extraction.low_confidence_fields,
            metadata=extraction.metadata,
        )

        await _transition_job(
            record,
            phase=ParsePhase.STAGING_PROFILE,
            progress=95,
            message="Saving the draft so the user can recover it after refresh or reconnect.",
        )

        store.upsert_draft(
            DraftRecord(
                draft_id=record.draft_id,
                session_id=record.session_id,
                profile=extraction.profile,
                missing_fields=extraction.missing_fields,
                low_confidence_fields=extraction.low_confidence_fields,
                metadata=extraction.metadata,
                last_job_id=record.job_id,
                created_at=created_at,
                updated_at=utcnow(),
                expires_at=utcnow(),
            )
        )

        await _transition_job(
            record,
            status_value=ParseJobStatus.COMPLETE,
            phase=ParsePhase.COMPLETE,
            progress=100,
            message="CV parsing complete. Review the highlighted fields before continuing.",
            profile=extraction.profile,
            missing_fields=extraction.missing_fields,
            low_confidence_fields=extraction.low_confidence_fields,
            metadata=extraction.metadata,
        )
    except (DocumentExtractionError, LLMExtractionError, CVExtractorError) as exc:
        logger.warning("Parse job %s failed: %s", record.job_id, exc)
        error = exc.to_payload()
        store.upsert_draft(
            DraftRecord(
                draft_id=record.draft_id,
                session_id=record.session_id,
                profile=record.profile or CandidateProfile(),
                missing_fields=record.missing_fields,
                low_confidence_fields=record.low_confidence_fields,
                metadata=record.metadata or ExtractionMetadata(
                    parsing_notes=["The upload failed before a complete draft could be staged."],
                    source_filename=filename,
                    source_mime_type=content_type,
                ),
                last_job_id=record.job_id,
                created_at=created_at,
                updated_at=utcnow(),
                expires_at=utcnow(),
            )
        )
        await _transition_job(
            record,
            status_value=ParseJobStatus.FAILED,
            phase=ParsePhase.FAILED,
            progress=100,
            message=error.message,
            error=error,
        )
    except Exception as exc:
        logger.exception("Unexpected parsing failure for job %s.", record.job_id)
        error = ApplicationError(
            code=ErrorCode.ERR_INTERNAL,
            message="We hit an unexpected problem while preparing this CV draft.",
            user_action="Retry the upload. If the issue continues, try a cleaner PDF export.",
            detail=str(exc),
            retryable=True,
        )
        await _transition_job(
            record,
            status_value=ParseJobStatus.FAILED,
            phase=ParsePhase.FAILED,
            progress=100,
            message=error.message,
            error=error,
        )


def _encode_sse(event: ParseEvent) -> str:
    payload = event.model_dump_json()
    return f"event: {event.event}\ndata: {payload}\n\n"


def _parse_match_criteria_payload(value: str | None) -> CvMatchCriteria | None:
    if not value:
        return None
    if len(value.encode("utf-8")) > MAX_MATCH_CRITERIA_BYTES:
        raise ValueError("Match criteria payload exceeded the configured size limit.")
    return CvMatchCriteria.model_validate_json(value)


async def _enforce_rate_limit(
    request: Request,
    *,
    namespace: str,
    subject: str | None,
    max_requests: int,
    window_seconds: int,
) -> JSONResponse | None:
    state = await asyncio.to_thread(
        rate_limiter.check,
        namespace,
        make_rate_limit_key(request, subject),
        max_requests,
        window_seconds,
    )
    if not state.allowed:
        return build_rate_limit_response(state)
    return None


@app.get("/healthz")
async def healthcheck(request: Request) -> dict[str, str] | JSONResponse:
    limited = await _enforce_rate_limit(
        request,
        namespace="healthz",
        subject=None,
        max_requests=120,
        window_seconds=60,
    )
    if limited:
        return limited
    return {"status": "ok", "version": APP_VERSION}


@app.post(
    "/api/v1/extractor/parse-cv",
    response_model=ParseJobAccepted,
    status_code=status.HTTP_202_ACCEPTED,
)
async def parse_cv(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    match_criteria: str | None = Form(default=None),
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> ParseJobAccepted | JSONResponse:
    limited = await _enforce_rate_limit(
        request,
        namespace="parse-cv-upload",
        subject=session_id,
        max_requests=10,
        window_seconds=10 * 60,
    )
    if limited:
        return limited

    resolved_session_id = _ensure_session(response, session_id)
    job_id = str(uuid4())
    draft_id = str(uuid4())
    filename = file.filename or "uploaded-cv.pdf"
    content_type = file.content_type or ""

    if len(filename) > 180:
        return _error_payload(
            ApplicationError(
                code=ErrorCode.ERR_UNSUPPORTED_FILE_TYPE,
                message="This filename is too long for safe processing.",
                user_action="Rename the file to 180 characters or fewer and retry.",
            )
        )

    try:
        document_bytes = await file.read()
    finally:
        await file.close()

    if content_type not in ALLOWED_DOCUMENT_TYPES and not filename.lower().endswith((".pdf", ".docx", ".txt", ".md", ".csv")):
        return _error_payload(
            ApplicationError(
                code=ErrorCode.ERR_UNSUPPORTED_FILE_TYPE,
                message="Only PDF, DOCX, and TXT CV uploads are supported right now.",
                user_action="Export the CV as a PDF, DOCX, or TXT file and upload it again.",
            )
        )

    if not document_bytes:
        return _error_payload(
            ApplicationError(
                code=ErrorCode.ERR_EMPTY_UPLOAD,
                message="This upload did not contain any file data.",
                user_action="Choose the CV again and retry the upload.",
            )
        )

    if len(document_bytes) > MAX_UPLOAD_BYTES:
        return _error_payload(
            ApplicationError(
                code=ErrorCode.ERR_FILE_TOO_LARGE,
                message="This document is larger than the current upload limit.",
                user_action=f"Compress the file or export a smaller document under {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
            )
        )

    try:
        parsed_match_criteria = _parse_match_criteria_payload(match_criteria)
    except Exception as exc:
        return _error_payload(
            ApplicationError(
                code=ErrorCode.ERR_INTERNAL,
                message="The match criteria payload was not valid JSON.",
                user_action="Fix the matching criteria JSON and retry the upload.",
                detail=str(exc),
            )
        )

    job_record = store.create_job(job_id=job_id, draft_id=draft_id, session_id=resolved_session_id, message="Upload received. Parsing will start immediately.")
    store.upsert_draft(
        DraftRecord(
            draft_id=draft_id,
            session_id=resolved_session_id,
            profile=CandidateProfile(),
            missing_fields=[],
            low_confidence_fields=[],
            metadata=ExtractionMetadata(
                source_filename=filename,
                source_mime_type=content_type,
                parsing_notes=["Draft shell created before parsing so the session can recover after refresh."],
            ),
            last_job_id=job_id,
            created_at=utcnow(),
            updated_at=utcnow(),
            expires_at=utcnow(),
        )
    )

    if USE_CELERY:
        task = parse_document.delay(
            job_id=job_id,
            document_bytes=document_bytes,
            filename=filename,
            content_type=content_type,
            match_criteria_json=match_criteria if match_criteria else None,
        )
        job_record.celery_task_id = task.id
        store.update_job(job_record)
    else:
        asyncio.create_task(
            _run_parse_job(
                job_record,
                document_bytes=document_bytes,
                filename=filename,
                content_type=content_type,
                match_criteria=parsed_match_criteria,
            )
        )

    return ParseJobAccepted(job=_job_to_response(request, job_record))


@app.post(
    "/api/v1/extractor/match-cv",
    response_model=CvMatchResponse,
)
async def match_cv(request: Request, payload: CvMatchRequest) -> CvMatchResponse | JSONResponse:
    limited = await _enforce_rate_limit(
        request,
        namespace="match-cv",
        subject=None,
        max_requests=30,
        window_seconds=5 * 60,
    )
    if limited:
        return limited

    criteria_payload = payload.criteria.model_dump(mode="json")
    cached = await asyncio.to_thread(
        cache_store.remember_json,
        "cv-match",
        {"raw_cv_text": payload.raw_cv_text, "criteria": criteria_payload},
        60 * 60,
        lambda: matcher.evaluate_candidate(payload.raw_cv_text, payload.criteria).model_dump(mode="json"),
    )
    return CvMatchResponse.model_validate(cached)


@app.get(
    "/api/v1/extractor/parse-cv/{job_id}",
    response_model=ParseJobResponse,
    name="get_parse_job",
)
async def get_parse_job(
    job_id: str,
    request: Request,
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> ParseJobResponse | JSONResponse:
    limited = await _enforce_rate_limit(
        request,
        namespace="parse-cv-status",
        subject=session_id,
        max_requests=120,
        window_seconds=60,
    )
    if limited:
        return limited

    record = store.get_job(job_id)
    if not record:
        return _error_payload(
            ApplicationError(
                code=ErrorCode.ERR_JOB_NOT_FOUND,
                message="We could not find that CV parsing job anymore.",
                user_action="Re-upload the CV to start a fresh draft.",
            )
        )

    ownership_error = _assert_session_ownership(record.session_id, session_id)
    if ownership_error:
        return _error_payload(ownership_error)
    return _job_to_response(request, record)


@app.get(
    "/api/v1/extractor/parse-cv/{job_id}/events",
    name="stream_parse_job_events",
    response_model=None,
)
async def stream_parse_job_events(
    job_id: str,
    request: Request,
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> Response:
    limited = await _enforce_rate_limit(
        request,
        namespace="parse-cv-events",
        subject=session_id,
        max_requests=120,
        window_seconds=60,
    )
    if limited:
        return limited

    record = store.get_job(job_id)
    if not record:
        return _error_payload(
            ApplicationError(
                code=ErrorCode.ERR_JOB_NOT_FOUND,
                message="We could not find that CV parsing job anymore.",
                user_action="Re-upload the CV to start a fresh draft.",
            )
        )

    ownership_error = _assert_session_ownership(record.session_id, session_id)
    if ownership_error:
        return _error_payload(ownership_error)

    async def event_stream() -> AsyncIterator[str]:
        queue = await broker.subscribe(job_id)
        try:
            current = store.get_job(job_id)
            if current:
                initial = ParseEvent(
                    event="parse.snapshot",
                    job_id=current.job_id,
                    draft_id=current.draft_id,
                    status=current.status,
                    phase=current.phase,
                    progress=current.progress,
                    message=current.message,
                    updated_at=current.updated_at,
                    profile=current.profile,
                    missing_fields=current.missing_fields,
                    low_confidence_fields=current.low_confidence_fields,
                    metadata=current.metadata,
                    error=current.error,
                )
                yield _encode_sse(initial)
                if current.status in {ParseJobStatus.COMPLETE, ParseJobStatus.FAILED}:
                    return

            while True:
                if await request.is_disconnected():
                    return
                try:
                    next_event = await asyncio.wait_for(queue.get(), timeout=15)
                    yield _encode_sse(next_event)
                    if next_event.status in {ParseJobStatus.COMPLETE, ParseJobStatus.FAILED}:
                        return
                except TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            await broker.unsubscribe(job_id, queue)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get(
    "/api/v1/extractor/profile-drafts/{draft_id}",
    response_model=ProfileDraftEnvelope,
    name="get_profile_draft",
)
async def get_profile_draft(
    draft_id: str,
    request: Request,
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> ProfileDraftEnvelope | JSONResponse:
    limited = await _enforce_rate_limit(
        request,
        namespace="profile-drafts-read",
        subject=session_id,
        max_requests=120,
        window_seconds=60,
    )
    if limited:
        return limited

    draft = store.get_draft(draft_id)
    if not draft:
        return _error_payload(
            ApplicationError(
                code=ErrorCode.ERR_STAGE_NOT_FOUND,
                message="We could not find that staged CV draft.",
                user_action="Re-upload the CV to create a new recoverable draft.",
            )
        )

    ownership_error = _assert_session_ownership(draft.session_id, session_id)
    if ownership_error:
        return _error_payload(ownership_error)
    return _draft_to_response(draft)


@app.put(
    "/api/v1/extractor/profile-drafts/{draft_id}",
    response_model=ProfileDraftEnvelope,
)
async def put_profile_draft(
    draft_id: str,
    request: Request,
    payload: ProfileDraftUpdateRequest,
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> ProfileDraftEnvelope | JSONResponse:
    limited = await _enforce_rate_limit(
        request,
        namespace="profile-drafts-write",
        subject=session_id,
        max_requests=30,
        window_seconds=5 * 60,
    )
    if limited:
        return limited

    draft = store.get_draft(draft_id)
    if not draft:
        return _error_payload(
            ApplicationError(
                code=ErrorCode.ERR_STAGE_NOT_FOUND,
                message="We could not find that staged CV draft.",
                user_action="Re-upload the CV to create a new recoverable draft.",
            )
        )

    ownership_error = _assert_session_ownership(draft.session_id, session_id)
    if ownership_error:
        return _error_payload(ownership_error)

    updated = store.upsert_draft(
        DraftRecord(
            draft_id=draft.draft_id,
            session_id=draft.session_id,
            profile=payload.profile,
            missing_fields=payload.missing_fields,
            low_confidence_fields=payload.low_confidence_fields,
            metadata=payload.metadata or draft.metadata,
            last_job_id=draft.last_job_id,
            created_at=draft.created_at,
            updated_at=utcnow(),
            expires_at=utcnow(),
        )
    )
    return _draft_to_response(updated)


@app.patch(
    "/api/v1/extractor/profile-drafts/{draft_id}",
    response_model=ProfileDraftEnvelope,
)
async def patch_profile_draft(
    draft_id: str,
    request: Request,
    payload: ProfileDraftPatchRequest,
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> ProfileDraftEnvelope | JSONResponse:
    limited = await _enforce_rate_limit(
        request,
        namespace="profile-drafts-write",
        subject=session_id,
        max_requests=30,
        window_seconds=5 * 60,
    )
    if limited:
        return limited

    draft = store.get_draft(draft_id)
    if not draft:
        return _error_payload(
            ApplicationError(
                code=ErrorCode.ERR_STAGE_NOT_FOUND,
                message="We could not find that staged CV draft.",
                user_action="Re-upload the CV to create a new recoverable draft.",
            )
        )

    ownership_error = _assert_session_ownership(draft.session_id, session_id)
    if ownership_error:
        return _error_payload(ownership_error)

    updated_profile = draft.profile
    if payload.profile is not None:
        updated_profile = deep_merge_model(draft.profile, payload.profile)

    updated = store.upsert_draft(
        DraftRecord(
            draft_id=draft.draft_id,
            session_id=draft.session_id,
            profile=updated_profile,
            missing_fields=payload.missing_fields if payload.missing_fields is not None else draft.missing_fields,
            low_confidence_fields=payload.low_confidence_fields if payload.low_confidence_fields is not None else draft.low_confidence_fields,
            metadata=payload.metadata or draft.metadata,
            last_job_id=draft.last_job_id,
            created_at=draft.created_at,
            updated_at=utcnow(),
            expires_at=utcnow(),
        )
    )
    return _draft_to_response(updated)
