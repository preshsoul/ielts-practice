from __future__ import annotations

import json
import logging
import os
from uuid import uuid4

from celery import Task
from psycopg import connect as pg_connect
from psycopg.rows import dict_row

from backend.cv_extractor.celery_app import celery_app
from backend.cv_extractor.schemas import CvMatchCriteria
from backend.cv_extractor.services.document_service import extract_text_from_document
from backend.cv_extractor.services.llm_service import extract_structured_data_from_text
from backend.cv_extractor.services.matcher_service import matcher

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("CV_PARSER_DATABASE_URL") or os.getenv("DATABASE_URL")


def _pg_conn():
    conn = pg_connect(DATABASE_URL, row_factory=dict_row)
    conn.autocommit = False
    return conn


def _update_job(job_id: str, **fields):
    sets = ", ".join(f"{k} = %({k})s" for k in fields)
    sql = f"UPDATE public.cv_processing_jobs SET {sets}, updated_at = now() WHERE id = %(job_id)s"
    fields["job_id"] = job_id
    with _pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, fields)
        conn.commit()


@celery_app.task(
    bind=True,
    name="cv_parser.parse_document",
    acks_late=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
)
def parse_document(
    self: Task,
    job_id: str,
    *,
    document_bytes: bytes,
    filename: str,
    content_type: str | None = None,
    match_criteria_json: str | None = None,
) -> dict:
    match_criteria = None
    if match_criteria_json:
        match_criteria = CvMatchCriteria.model_validate_json(match_criteria_json)

    logger.info("Task %s: starting parse for %s", self.request.id, filename)
    _update_job(
        job_id,
        job_status="processing",
        phase="validating_file",
        progress=10,
        message="Validating document...",
    )

    try:
        _update_job(
            job_id,
            phase="extracting_text",
            progress=35,
            message="Reading text from document...",
        )
        document_result = extract_text_from_document(
            document_bytes, filename, content_type
        )
        raw_text = document_result.text

        _update_job(
            job_id,
            phase="analyzing_academics",
            progress=70,
            message="Analyzing with LLM...",
        )
        extraction = extract_structured_data_from_text(raw_text)
        extraction.metadata.source_filename = filename
        extraction.metadata.source_mime_type = content_type
        extraction.metadata.extracted_characters = len(raw_text)
        extraction.metadata.parser_strategy = document_result.strategy
        extraction.metadata.parsing_notes.extend(document_result.notes)

        if match_criteria is not None:
            det_match = matcher.evaluate_candidate(raw_text, match_criteria)
            extraction.metadata.deterministic_match = det_match

        _update_job(
            job_id,
            phase="normalizing_fields",
            progress=85,
            message="Normalizing extracted fields...",
        )

        draft_id = str(uuid4())
        with _pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO public.cv_profile_drafts
                        (id, profile_json, missing_fields, low_confidence_fields, metadata_json)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        draft_id,
                        extraction.profile.model_dump_json(),
                        json.dumps(
                            [f.model_dump(mode="json") for f in extraction.missing_fields]
                        ),
                        json.dumps(
                            [
                                f.model_dump(mode="json")
                                for f in extraction.low_confidence_fields
                            ]
                        ),
                        extraction.metadata.model_dump_json(),
                    ),
                )
            conn.commit()

        profile_json = extraction.profile.model_dump(mode="json")
        missing_json = json.dumps(
            [f.model_dump(mode="json") for f in extraction.missing_fields]
        )
        low_conf_json = json.dumps(
            [f.model_dump(mode="json") for f in extraction.low_confidence_fields]
        )
        meta_json = extraction.metadata.model_dump_json()

        _update_job(
            job_id,
            job_status="completed",
            phase="complete",
            progress=100,
            message="CV parsing complete.",
            parsed_profile=profile_json,
            missing_fields=missing_json,
            low_confidence_fields=low_conf_json,
            metadata_json=meta_json,
            completed_at="now()",
        )

        return {"job_id": job_id, "status": "completed", "draft_id": draft_id}

    except Exception as exc:
        logger.exception("Task %s failed", self.request.id)
        _update_job(
            job_id,
            job_status="failed",
            phase="failed",
            progress=100,
            message=str(exc)[:500],
            error_code=getattr(exc, "code", "ERR_INTERNAL"),
            error_message=str(exc)[:2000],
            retry_count=self.request.retries,
        )
        raise
