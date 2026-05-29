from __future__ import annotations

from dataclasses import dataclass

from backend.cv_extractor.schemas import ApplicationError, ErrorCode


@dataclass(slots=True)
class CVExtractorError(Exception):
    code: ErrorCode
    message: str
    user_action: str | None = None
    detail: str | None = None
    retryable: bool = False

    def to_payload(self) -> ApplicationError:
        return ApplicationError(
            code=self.code,
            message=self.message,
            retryable=self.retryable,
            user_action=self.user_action,
            detail=self.detail,
        )

    def __str__(self) -> str:
        return self.message
