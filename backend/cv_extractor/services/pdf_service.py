from __future__ import annotations

import asyncio
import io
import logging
import os

from backend.cv_extractor.app_errors import CVExtractorError
from backend.cv_extractor.schemas import ErrorCode
from backend.cv_extractor.services.text_processing import repair_extracted_layout


logger = logging.getLogger(__name__)
MIN_EXTRACTED_TEXT_LENGTH = 100
MAX_PDF_PAGES = int(os.getenv("CV_MAX_PDF_PAGES", "40"))


class PDFExtractionError(CVExtractorError):
    """Raised when a PDF cannot be parsed into usable text."""


def _extract_text_sync(pdf_bytes: bytes) -> str:
    import pdfplumber
    from pdfminer.pdfdocument import PDFPasswordIncorrect
    from pdfminer.pdfparser import PDFSyntaxError

    if not pdf_bytes:
        raise PDFExtractionError(
            code=ErrorCode.ERR_EMPTY_UPLOAD,
            message="This file looks empty, so we could not start the CV scan.",
            user_action="Choose the original CV file again and try once more.",
        )

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            if len(pdf.pages) > MAX_PDF_PAGES:
                raise PDFExtractionError(
                    code=ErrorCode.ERR_FILE_TOO_LARGE,
                    message="This PDF has too many pages for safe CV parsing.",
                    user_action=f"Upload a shorter CV PDF with no more than {MAX_PDF_PAGES} pages.",
                )
            pages = [page.extract_text() or "" for page in pdf.pages]
    except PDFPasswordIncorrect as exc:
        raise PDFExtractionError(
            code=ErrorCode.ERR_PDF_ENCRYPTED,
            message="This PDF is password protected, so we cannot read it yet.",
            user_action="Remove the password or export an unlocked PDF before uploading.",
            detail=str(exc),
        ) from exc
    except PDFSyntaxError as exc:
        raise PDFExtractionError(
            code=ErrorCode.ERR_PDF_CORRUPTED,
            message="This PDF appears to be corrupted or unreadable.",
            user_action="Open the file locally and re-export it as a fresh PDF, then upload again.",
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise PDFExtractionError(
            code=ErrorCode.ERR_PDF_CORRUPTED,
            message="We could not read this PDF successfully.",
            user_action="Try a cleaner export, or upload a text-based version of the CV.",
            detail=str(exc),
        ) from exc

    combined_text = "\n\n".join(pages)
    normalized_text = repair_extracted_layout(combined_text)

    if len(normalized_text) < MIN_EXTRACTED_TEXT_LENGTH:
        raise PDFExtractionError(
            code=ErrorCode.ERR_PDF_NO_TEXT,
            message="We found too little selectable text in this PDF to build a reliable profile.",
            user_action="Upload a text-based PDF or run OCR on the scanned document first.",
        )

    logger.info("Extracted %s characters from PDF.", len(normalized_text))
    return normalized_text


async def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    return await asyncio.to_thread(_extract_text_sync, pdf_bytes)
