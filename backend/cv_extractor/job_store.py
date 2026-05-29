from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator, Protocol

from backend.cv_extractor.schemas import (
    ApplicationError,
    CandidateProfile,
    DraftRecord,
    ExtractionMetadata,
    FieldIssue,
    JobRecord,
    ParsePhase,
    ParseJobStatus,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class StageStoreBackend(Protocol):
    def purge_expired(self) -> None: ...

    def create_job(self, job_id: str, draft_id: str, session_id: str, message: str) -> JobRecord: ...

    def update_job(self, record: JobRecord) -> JobRecord: ...

    def get_job(self, job_id: str) -> JobRecord | None: ...

    def upsert_draft(self, record: DraftRecord) -> DraftRecord: ...

    def get_draft(self, draft_id: str) -> DraftRecord | None: ...


class StageStore:
    def __init__(self, database_path: str | None = None, ttl_minutes: int = 60) -> None:
        backend_kind = os.getenv("CV_PARSER_STAGE_BACKEND", "auto").strip().lower()
        postgres_url = os.getenv("CV_PARSER_DATABASE_URL") or os.getenv("DATABASE_URL")

        if backend_kind == "postgres" or (backend_kind == "auto" and postgres_url and _looks_like_postgres_url(postgres_url)):
            self._backend: StageStoreBackend = PostgresStageStore(database_url=postgres_url, ttl_minutes=ttl_minutes)
        else:
            self._backend = SQLiteStageStore(database_path=database_path, ttl_minutes=ttl_minutes)

    def purge_expired(self) -> None:
        self._backend.purge_expired()

    def create_job(self, job_id: str, draft_id: str, session_id: str, message: str) -> JobRecord:
        return self._backend.create_job(job_id=job_id, draft_id=draft_id, session_id=session_id, message=message)

    def update_job(self, record: JobRecord) -> JobRecord:
        return self._backend.update_job(record)

    def get_job(self, job_id: str) -> JobRecord | None:
        return self._backend.get_job(job_id)

    def upsert_draft(self, record: DraftRecord) -> DraftRecord:
        return self._backend.upsert_draft(record)

    def get_draft(self, draft_id: str) -> DraftRecord | None:
        return self._backend.get_draft(draft_id)


class SQLiteStageStore:
    def __init__(self, database_path: str | None = None, ttl_minutes: int = 60) -> None:
        default_path = Path(__file__).resolve().parent / "data" / "cv_parser_staging.sqlite3"
        self._database_path = Path(database_path or os.getenv("CV_PARSER_DB_PATH", str(default_path)))
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        self._ttl = timedelta(minutes=ttl_minutes)
        self._lock = threading.Lock()
        self._initialize()

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self._database_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS parse_jobs (
                    job_id TEXT PRIMARY KEY,
                    draft_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    progress INTEGER NOT NULL,
                    message TEXT NOT NULL,
                    celery_task_id TEXT,
                    profile_json TEXT,
                    missing_fields_json TEXT NOT NULL,
                    low_confidence_fields_json TEXT NOT NULL,
                    metadata_json TEXT,
                    error_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS drafts (
                    draft_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    profile_json TEXT NOT NULL,
                    missing_fields_json TEXT NOT NULL,
                    low_confidence_fields_json TEXT NOT NULL,
                    metadata_json TEXT NOT NULL,
                    last_job_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                )
                """
            )

    def purge_expired(self) -> None:
        now = utcnow().isoformat()
        with self._lock, self._connection() as conn:
            conn.execute("DELETE FROM parse_jobs WHERE expires_at < ?", (now,))
            conn.execute("DELETE FROM drafts WHERE expires_at < ?", (now,))

    def create_job(self, job_id: str, draft_id: str, session_id: str, message: str) -> JobRecord:
        self.purge_expired()
        now = utcnow()
        record = JobRecord(
            job_id=job_id,
            draft_id=draft_id,
            session_id=session_id,
            status=ParseJobStatus.PENDING,
            phase=ParsePhase.QUEUED,
            progress=0,
            message=message,
            created_at=now,
            updated_at=now,
            expires_at=now + self._ttl,
        )
        with self._lock, self._connection() as conn:
            conn.execute(
                """
                INSERT INTO parse_jobs (
                    job_id, draft_id, session_id, status, phase, progress, message,
                    celery_task_id,
                    profile_json, missing_fields_json, low_confidence_fields_json,
                    metadata_json, error_json, created_at, updated_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                _job_insert_tuple(record, serialize_datetimes=True),
            )
        return record

    def update_job(self, record: JobRecord) -> JobRecord:
        record.updated_at = utcnow()
        record.expires_at = record.updated_at + self._ttl
        with self._lock, self._connection() as conn:
            conn.execute(
                """
                UPDATE parse_jobs
                SET draft_id = ?, session_id = ?, status = ?, phase = ?, progress = ?,
                    message = ?, celery_task_id = ?, profile_json = ?, missing_fields_json = ?,
                    low_confidence_fields_json = ?, metadata_json = ?, error_json = ?,
                    updated_at = ?, expires_at = ?
                WHERE job_id = ?
                """,
                (
                    record.draft_id,
                    record.session_id,
                    record.status.value,
                    record.phase.value,
                    record.progress,
                    record.message,
                    record.celery_task_id,
                    _dump_json(record.profile.model_dump(mode="json")) if record.profile else None,
                    _dump_json([item.model_dump(mode="json") for item in record.missing_fields]),
                    _dump_json([item.model_dump(mode="json") for item in record.low_confidence_fields]),
                    _dump_json(record.metadata.model_dump(mode="json")) if record.metadata else None,
                    _dump_json(record.error.model_dump(mode="json")) if record.error else None,
                    record.updated_at.isoformat(),
                    record.expires_at.isoformat(),
                    record.job_id,
                ),
            )
        return record

    def get_job(self, job_id: str) -> JobRecord | None:
        self.purge_expired()
        with self._connection() as conn:
            row = conn.execute("SELECT * FROM parse_jobs WHERE job_id = ?", (job_id,)).fetchone()
        return _row_to_job(dict(row)) if row else None

    def upsert_draft(self, record: DraftRecord) -> DraftRecord:
        record.updated_at = utcnow()
        record.expires_at = record.updated_at + self._ttl
        with self._lock, self._connection() as conn:
            conn.execute(
                """
                INSERT INTO drafts (
                    draft_id, session_id, profile_json, missing_fields_json,
                    low_confidence_fields_json, metadata_json, last_job_id,
                    created_at, updated_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(draft_id) DO UPDATE SET
                    session_id = excluded.session_id,
                    profile_json = excluded.profile_json,
                    missing_fields_json = excluded.missing_fields_json,
                    low_confidence_fields_json = excluded.low_confidence_fields_json,
                    metadata_json = excluded.metadata_json,
                    last_job_id = excluded.last_job_id,
                    updated_at = excluded.updated_at,
                    expires_at = excluded.expires_at
                """,
                (
                    record.draft_id,
                    record.session_id,
                    _dump_json(record.profile.model_dump(mode="json")),
                    _dump_json([item.model_dump(mode="json") for item in record.missing_fields]),
                    _dump_json([item.model_dump(mode="json") for item in record.low_confidence_fields]),
                    _dump_json(record.metadata.model_dump(mode="json")),
                    record.last_job_id,
                    record.created_at.isoformat(),
                    record.updated_at.isoformat(),
                    record.expires_at.isoformat(),
                ),
            )
        return record

    def get_draft(self, draft_id: str) -> DraftRecord | None:
        self.purge_expired()
        with self._connection() as conn:
            row = conn.execute("SELECT * FROM drafts WHERE draft_id = ?", (draft_id,)).fetchone()
        return _row_to_draft(dict(row)) if row else None


class PostgresStageStore:
    def __init__(self, database_url: str | None, ttl_minutes: int = 60) -> None:
        if not database_url:
            raise RuntimeError("Postgres staging requested, but CV_PARSER_DATABASE_URL or DATABASE_URL is not set.")
        self._database_url = database_url
        self._ttl = timedelta(minutes=ttl_minutes)
        self._lock = threading.Lock()
        self._pool = self._create_pool()
        self._initialize()

    def _create_pool(self):
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
        except ImportError as exc:
            raise RuntimeError(
                "psycopg and psycopg-pool are required for Postgres staging. Install backend/cv_extractor requirements first."
            ) from exc
        return ConnectionPool(
            conninfo=self._database_url,
            min_size=1,
            max_size=int(os.getenv("CV_PARSER_DB_POOL_MAX_SIZE", "5")),
            kwargs={"row_factory": dict_row, "autocommit": False},
            open=True,
        )

    @contextmanager
    def _connection(self) -> Iterator[Any]:
        with self._pool.connection() as connection:
            try:
                yield connection
                connection.commit()
            except Exception:
                connection.rollback()
                raise

    def _initialize(self) -> None:
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS cv_parse_jobs (
                        job_id TEXT PRIMARY KEY,
                        draft_id TEXT NOT NULL,
                        session_id TEXT NOT NULL,
                        status TEXT NOT NULL,
                        phase TEXT NOT NULL,
                        progress INTEGER NOT NULL,
                        message TEXT NOT NULL,
                        celery_task_id TEXT,
                        profile_json JSONB,
                        missing_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                        low_confidence_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                        metadata_json JSONB,
                        error_json JSONB,
                        created_at TIMESTAMPTZ NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL,
                        expires_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS cv_profile_drafts (
                        draft_id TEXT PRIMARY KEY,
                        session_id TEXT NOT NULL,
                        profile_json JSONB NOT NULL,
                        missing_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                        low_confidence_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                        metadata_json JSONB NOT NULL,
                        last_job_id TEXT,
                        created_at TIMESTAMPTZ NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL,
                        expires_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
                cur.execute("CREATE INDEX IF NOT EXISTS idx_cv_parse_jobs_expires_at ON cv_parse_jobs (expires_at)")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_cv_profile_drafts_expires_at ON cv_profile_drafts (expires_at)")

    def purge_expired(self) -> None:
        now = utcnow()
        with self._lock, self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM cv_parse_jobs WHERE expires_at < %s", (now,))
                cur.execute("DELETE FROM cv_profile_drafts WHERE expires_at < %s", (now,))

    def create_job(self, job_id: str, draft_id: str, session_id: str, message: str) -> JobRecord:
        self.purge_expired()
        now = utcnow()
        record = JobRecord(
            job_id=job_id,
            draft_id=draft_id,
            session_id=session_id,
            status=ParseJobStatus.PENDING,
            phase=ParsePhase.QUEUED,
            progress=0,
            message=message,
            created_at=now,
            updated_at=now,
            expires_at=now + self._ttl,
        )
        with self._lock, self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO cv_parse_jobs (
                        job_id, draft_id, session_id, status, phase, progress, message,
                        celery_task_id,
                        profile_json, missing_fields_json, low_confidence_fields_json,
                        metadata_json, error_json, created_at, updated_at, expires_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s)
                    """,
                    _job_insert_tuple(record),
                )
        return record

    def update_job(self, record: JobRecord) -> JobRecord:
        record.updated_at = utcnow()
        record.expires_at = record.updated_at + self._ttl
        with self._lock, self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE cv_parse_jobs
                    SET draft_id = %s, session_id = %s, status = %s, phase = %s, progress = %s,
                        message = %s, celery_task_id = %s, profile_json = %s::jsonb, missing_fields_json = %s::jsonb,
                        low_confidence_fields_json = %s::jsonb, metadata_json = %s::jsonb, error_json = %s::jsonb,
                        updated_at = %s, expires_at = %s
                    WHERE job_id = %s
                    """,
                    (
                        record.draft_id,
                        record.session_id,
                        record.status.value,
                        record.phase.value,
                        record.progress,
                        record.message,
                        record.celery_task_id,
                        _dump_json(record.profile.model_dump(mode="json")) if record.profile else None,
                        _dump_json([item.model_dump(mode="json") for item in record.missing_fields]),
                        _dump_json([item.model_dump(mode="json") for item in record.low_confidence_fields]),
                        _dump_json(record.metadata.model_dump(mode="json")) if record.metadata else None,
                        _dump_json(record.error.model_dump(mode="json")) if record.error else None,
                        record.updated_at,
                        record.expires_at,
                        record.job_id,
                    ),
                )
        return record

    def get_job(self, job_id: str) -> JobRecord | None:
        self.purge_expired()
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM cv_parse_jobs WHERE job_id = %s", (job_id,))
                row = cur.fetchone()
        return _row_to_job(row) if row else None

    def upsert_draft(self, record: DraftRecord) -> DraftRecord:
        record.updated_at = utcnow()
        record.expires_at = record.updated_at + self._ttl
        with self._lock, self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO cv_profile_drafts (
                        draft_id, session_id, profile_json, missing_fields_json,
                        low_confidence_fields_json, metadata_json, last_job_id,
                        created_at, updated_at, expires_at
                    ) VALUES (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s)
                    ON CONFLICT (draft_id) DO UPDATE SET
                        session_id = EXCLUDED.session_id,
                        profile_json = EXCLUDED.profile_json,
                        missing_fields_json = EXCLUDED.missing_fields_json,
                        low_confidence_fields_json = EXCLUDED.low_confidence_fields_json,
                        metadata_json = EXCLUDED.metadata_json,
                        last_job_id = EXCLUDED.last_job_id,
                        updated_at = EXCLUDED.updated_at,
                        expires_at = EXCLUDED.expires_at
                    """,
                    (
                        record.draft_id,
                        record.session_id,
                        _dump_json(record.profile.model_dump(mode="json")),
                        _dump_json([item.model_dump(mode="json") for item in record.missing_fields]),
                        _dump_json([item.model_dump(mode="json") for item in record.low_confidence_fields]),
                        _dump_json(record.metadata.model_dump(mode="json")),
                        record.last_job_id,
                        record.created_at,
                        record.updated_at,
                        record.expires_at,
                    ),
                )
        return record

    def get_draft(self, draft_id: str) -> DraftRecord | None:
        self.purge_expired()
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM cv_profile_drafts WHERE draft_id = %s", (draft_id,))
                row = cur.fetchone()
        return _row_to_draft(row) if row else None


def _looks_like_postgres_url(value: str) -> bool:
    lowered = value.strip().lower()
    return lowered.startswith("postgres://") or lowered.startswith("postgresql://")


def _job_insert_tuple(record: JobRecord, serialize_datetimes: bool = False) -> tuple[Any, ...]:
    created_at = record.created_at.isoformat() if serialize_datetimes else record.created_at
    updated_at = record.updated_at.isoformat() if serialize_datetimes else record.updated_at
    expires_at = record.expires_at.isoformat() if serialize_datetimes else record.expires_at
    return (
        record.job_id,
        record.draft_id,
        record.session_id,
        record.status.value,
        record.phase.value,
        record.progress,
        record.message,
        record.celery_task_id,
        _dump_json(record.profile.model_dump(mode="json")) if record.profile else None,
        _dump_json([item.model_dump(mode="json") for item in record.missing_fields]),
        _dump_json([item.model_dump(mode="json") for item in record.low_confidence_fields]),
        _dump_json(record.metadata.model_dump(mode="json")) if record.metadata else None,
        _dump_json(record.error.model_dump(mode="json")) if record.error else None,
        created_at,
        updated_at,
        expires_at,
    )


def _row_to_job(row: dict[str, Any]) -> JobRecord:
    return JobRecord(
        job_id=row["job_id"],
        draft_id=row["draft_id"],
        session_id=row["session_id"],
        status=ParseJobStatus(row["status"]),
        phase=ParsePhase(row["phase"]),
        progress=row["progress"],
        message=row["message"],
        celery_task_id=row.get("celery_task_id"),
        profile=CandidateProfile.model_validate(_load_jsonish(row.get("profile_json")) or {}),
        missing_fields=[FieldIssue.model_validate(item) for item in (_load_jsonish(row.get("missing_fields_json")) or [])],
        low_confidence_fields=[FieldIssue.model_validate(item) for item in (_load_jsonish(row.get("low_confidence_fields_json")) or [])],
        metadata=ExtractionMetadata.model_validate(_load_jsonish(row.get("metadata_json")) or {}),
        error=ApplicationError.model_validate(_load_jsonish(row.get("error_json"))) if row.get("error_json") else None,
        created_at=_coerce_datetime(row["created_at"]),
        updated_at=_coerce_datetime(row["updated_at"]),
        expires_at=_coerce_datetime(row["expires_at"]),
    )


def _row_to_draft(row: dict[str, Any]) -> DraftRecord:
    return DraftRecord(
        draft_id=row["draft_id"],
        session_id=row["session_id"],
        profile=CandidateProfile.model_validate(_load_jsonish(row.get("profile_json")) or {}),
        missing_fields=[FieldIssue.model_validate(item) for item in (_load_jsonish(row.get("missing_fields_json")) or [])],
        low_confidence_fields=[FieldIssue.model_validate(item) for item in (_load_jsonish(row.get("low_confidence_fields_json")) or [])],
        metadata=ExtractionMetadata.model_validate(_load_jsonish(row.get("metadata_json")) or {}),
        last_job_id=row.get("last_job_id"),
        created_at=_coerce_datetime(row["created_at"]),
        updated_at=_coerce_datetime(row["updated_at"]),
        expires_at=_coerce_datetime(row["expires_at"]),
    )


def _dump_json(value: object) -> str:
    return json.dumps(value)


def _load_jsonish(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, str):
        return json.loads(value)
    return value


def _coerce_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value)
    raise TypeError(f"Unsupported datetime value: {value!r}")
