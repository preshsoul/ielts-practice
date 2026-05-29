from __future__ import annotations

import asyncio
import io
import logging
import os
import re
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from xml.etree import ElementTree

from backend.cv_extractor.app_errors import CVExtractorError
from backend.cv_extractor.schemas import ErrorCode
from backend.cv_extractor.services.pdf_service import PDFExtractionError, extract_text_from_pdf
from backend.cv_extractor.services.text_processing import normalize_whitespace, repair_extracted_layout


logger = logging.getLogger(__name__)
MIN_EXTRACTED_TEXT_LENGTH = 100
WORD_NAMESPACE = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
PDF_MIME_TYPES = {"application/pdf", "application/x-pdf"}
DOCX_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-word.document.macroEnabled.12",
}
TEXT_MIME_PREFIXES = ("text/",)
TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".text"}
DOCX_EXTENSIONS = {".docx"}
PDF_EXTENSIONS = {".pdf"}
DOCX_REQUIRED_MEMBERS = {"[Content_Types].xml", "word/document.xml"}
TEXT_BINARY_RATIO_LIMIT = float(os.getenv("CV_TEXT_BINARY_RATIO_LIMIT", "0.30"))
DOCX_MAX_XML_BYTES = int(os.getenv("CV_DOCX_MAX_XML_BYTES", str(8 * 1024 * 1024)))
DOCX_MAX_ARCHIVE_MEMBERS = int(os.getenv("CV_DOCX_MAX_ARCHIVE_MEMBERS", "256"))
EXTRACTION_TIMEOUT_SECONDS = float(os.getenv("CV_EXTRACTION_TIMEOUT_SECONDS", "20"))
ENABLE_LITEPARSE_FALLBACK = os.getenv("CV_ENABLE_LITEPARSE_FALLBACK", "false").strip().lower() in {"1", "true", "yes", "on"}
DEDOC_URL = os.getenv("CV_DEDOC_URL", "").strip()


@dataclass(slots=True)
class ExtractedDocumentText:
    text: str
    strategy: str
    notes: list[str]


class DocumentExtractionError(CVExtractorError):
    """Raised when any supported document cannot be parsed into usable text."""


def _infer_document_kind(filename: str, content_type: str | None) -> str:
    normalized_name = filename.lower().strip()
    normalized_type = (content_type or "").lower().strip()

    if normalized_type in PDF_MIME_TYPES or any(normalized_name.endswith(ext) for ext in PDF_EXTENSIONS):
        return "pdf"
    if normalized_type in DOCX_MIME_TYPES or any(normalized_name.endswith(ext) for ext in DOCX_EXTENSIONS):
        return "docx"
    if normalized_type.startswith(TEXT_MIME_PREFIXES) or any(normalized_name.endswith(ext) for ext in TEXT_EXTENSIONS):
        return "text"
    return "unknown"


def _looks_like_pdf(file_bytes: bytes) -> bool:
    return file_bytes.startswith(b"%PDF-")


def _looks_like_docx(file_bytes: bytes) -> bool:
    if not file_bytes.startswith(b"PK"):
        return False
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            names = set(archive.namelist())
            return DOCX_REQUIRED_MEMBERS.issubset(names)
    except zipfile.BadZipFile:
        return False


def _looks_like_text(file_bytes: bytes) -> bool:
    if not file_bytes:
        return False
    sample = file_bytes[:4096]
    if b"\x00" in sample:
        return False
    suspicious = sum(
        1 for byte in sample
        if byte < 9 or (13 < byte < 32) or byte == 127
    )
    ratio = suspicious / max(1, len(sample))
    return ratio <= TEXT_BINARY_RATIO_LIMIT


def _sniff_document_kind(file_bytes: bytes, filename: str, content_type: str | None) -> str:
    if _looks_like_pdf(file_bytes):
        return "pdf"
    if _looks_like_docx(file_bytes):
        return "docx"
    if _looks_like_text(file_bytes):
        return "text"
    return _infer_document_kind(filename, content_type)


def _assert_minimum_text(normalized_text: str, empty_message: str) -> str:
    if len(normalized_text) < MIN_EXTRACTED_TEXT_LENGTH:
        raise DocumentExtractionError(
            code=ErrorCode.ERR_PDF_NO_TEXT,
            message=empty_message,
            user_action="Upload a text-based document, run OCR, or paste the CV text directly.",
        )
    return normalized_text


def _extract_text_from_txt_sync(file_bytes: bytes) -> str:
    if not file_bytes:
        raise DocumentExtractionError(
            code=ErrorCode.ERR_EMPTY_UPLOAD,
            message="This file looks empty, so we could not start the CV scan.",
            user_action="Choose the original CV file again and try once more.",
        )

    if not _looks_like_text(file_bytes):
        raise DocumentExtractionError(
            code=ErrorCode.ERR_UNSUPPORTED_FILE_TYPE,
            message="This text upload contains too many binary bytes to parse safely.",
            user_action="Upload a genuine TXT/MD/CSV file or export the CV as PDF or DOCX.",
        )

    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            decoded = file_bytes.decode(encoding)
            return _assert_minimum_text(
                _normalize_whitespace(decoded),
                "We found too little readable text in this text document to build a reliable profile.",
            )
        except UnicodeDecodeError:
            continue

    raise DocumentExtractionError(
        code=ErrorCode.ERR_PDF_CORRUPTED,
        message="We could not decode this text document successfully.",
        user_action="Save the file as UTF-8 text and upload it again.",
    )


def _extract_text_from_docx_sync(file_bytes: bytes) -> str:
    if not file_bytes:
        raise DocumentExtractionError(
            code=ErrorCode.ERR_EMPTY_UPLOAD,
            message="This file looks empty, so we could not start the CV scan.",
            user_action="Choose the original CV file again and try once more.",
        )

    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            members = archive.infolist()
            if len(members) > DOCX_MAX_ARCHIVE_MEMBERS:
                raise DocumentExtractionError(
                    code=ErrorCode.ERR_UNSUPPORTED_FILE_TYPE,
                    message="This DOCX contains too many archived members to parse safely.",
                    user_action="Re-save the document as a standard DOCX file and retry.",
                )
            names = {member.filename for member in members}
            if not DOCX_REQUIRED_MEMBERS.issubset(names):
                raise DocumentExtractionError(
                    code=ErrorCode.ERR_PDF_CORRUPTED,
                    message="This DOCX file is missing required document parts.",
                    user_action="Re-save the file as a standard DOCX document and upload it again.",
                )
            document_member = archive.getinfo("word/document.xml")
            if document_member.file_size > DOCX_MAX_XML_BYTES:
                raise DocumentExtractionError(
                    code=ErrorCode.ERR_FILE_TOO_LARGE,
                    message="The main DOCX document XML is too large for safe parsing.",
                    user_action="Export a smaller CV document and retry.",
                )
            xml_bytes = archive.read("word/document.xml")
    except KeyError as exc:
        raise DocumentExtractionError(
            code=ErrorCode.ERR_PDF_CORRUPTED,
            message="This DOCX file is missing its main document XML.",
            user_action="Re-save the file as a standard DOCX document and upload it again.",
            detail=str(exc),
        ) from exc
    except zipfile.BadZipFile as exc:
        raise DocumentExtractionError(
            code=ErrorCode.ERR_PDF_CORRUPTED,
            message="This DOCX file appears to be corrupted or unreadable.",
            user_action="Open the file locally, save a fresh copy, and upload it again.",
            detail=str(exc),
        ) from exc

    try:
        root = ElementTree.fromstring(xml_bytes)
    except ElementTree.ParseError as exc:
        raise DocumentExtractionError(
            code=ErrorCode.ERR_PDF_CORRUPTED,
            message="We could not parse the text structure inside this DOCX file.",
            user_action="Export a cleaner DOCX or PDF and upload it again.",
            detail=str(exc),
        ) from exc

    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", WORD_NAMESPACE):
        runs = [node.text or "" for node in paragraph.findall(".//w:t", WORD_NAMESPACE)]
        text = "".join(runs).strip()
        if text:
            paragraphs.append(text)

    normalized = repair_extracted_layout("\n\n".join(paragraphs))
    return _assert_minimum_text(
        normalized,
        "We found too little readable text in this DOCX file to build a reliable profile.",
    )


def _extract_with_liteparse_sync(file_bytes: bytes) -> str:
    try:
        from liteparse import LiteParse
    except ImportError as exc:
        raise DocumentExtractionError(
            code=ErrorCode.ERR_UNSUPPORTED_FILE_TYPE,
            message="LiteParse fallback is enabled but the liteparse package is not installed.",
            user_action="Install the liteparse package on the backend or disable the fallback.",
            detail=str(exc),
        ) from exc

    parser = LiteParse(ocr_enabled=True)
    result = parser.parse(file_bytes)
    text = getattr(result, "text", "") or ""
    normalized = repair_extracted_layout(text)
    return _assert_minimum_text(
        normalized,
        "LiteParse could not recover enough readable text from this CV.",
    )


def _extract_with_dedoc_sync(file_bytes: bytes, filename: str) -> str:
    if not DEDOC_URL:
        raise DocumentExtractionError(
            code=ErrorCode.ERR_UNSUPPORTED_FILE_TYPE,
            message="Dedoc fallback is not configured.",
            user_action="Set CV_DEDOC_URL or disable the Dedoc fallback.",
        )

    boundary = "----loci-dedoc-upload"
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    body = _build_multipart_body(boundary, filename, file_bytes)
    request = urllib.request.Request(DEDOC_URL, data=body, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(request, timeout=EXTRACTION_TIMEOUT_SECONDS) as response:
            payload = response.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as exc:
        raise DocumentExtractionError(
            code=ErrorCode.ERR_LLM_UNAVAILABLE,
            message="The Dedoc fallback service is unavailable right now.",
            user_action="Retry later or use the native parser path.",
            detail=str(exc),
            retryable=True,
        ) from exc

    text = _flatten_dedoc_payload(payload)
    normalized = repair_extracted_layout(text)
    return _assert_minimum_text(
        normalized,
        "Dedoc could not recover enough readable text from this CV.",
    )


def _build_multipart_body(boundary: str, filename: str, file_bytes: bytes) -> bytes:
    disposition = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode("utf-8")
    tail = f"\r\n--{boundary}--\r\n".encode("utf-8")
    return disposition + file_bytes + tail


def _flatten_dedoc_payload(payload: str) -> str:
    import json

    data = json.loads(payload)
    structure = data.get("content", {}).get("structure") or data.get("structure") or {}
    lines: list[str] = []

    def walk(node: dict) -> None:
        text = node.get("text")
        if isinstance(text, str) and text.strip():
            lines.append(text.strip())
        for child in node.get("subparagraphs", []) or []:
            if isinstance(child, dict):
                walk(child)

    if isinstance(structure, dict):
        walk(structure)

    tables = data.get("content", {}).get("tables") or data.get("tables") or []
    for table in tables:
        cells = []
        for row in table.get("cells", []) or []:
            text = row.get("text")
            if isinstance(text, str) and text.strip():
                cells.append(text.strip())
        if cells:
            lines.append(" | ".join(cells))

    return normalize_whitespace("\n".join(lines))


async def extract_text_from_document(file_bytes: bytes, filename: str, content_type: str | None) -> ExtractedDocumentText:
    kind = _sniff_document_kind(file_bytes, filename, content_type)
    attempted_notes: list[str] = []
    try:
        if kind == "pdf":
            text = await asyncio.wait_for(extract_text_from_pdf(file_bytes), timeout=EXTRACTION_TIMEOUT_SECONDS)
            attempted_notes.append("Parsed with the native PDF text extractor after layout repair.")
            return ExtractedDocumentText(text=text, strategy="native_pdf", notes=attempted_notes)
        if kind == "docx":
            text = await asyncio.wait_for(asyncio.to_thread(_extract_text_from_docx_sync, file_bytes), timeout=EXTRACTION_TIMEOUT_SECONDS)
            attempted_notes.append("Parsed with the native DOCX structure extractor after layout repair.")
            return ExtractedDocumentText(text=text, strategy="native_docx", notes=attempted_notes)
        if kind == "text":
            text = await asyncio.wait_for(asyncio.to_thread(_extract_text_from_txt_sync, file_bytes), timeout=EXTRACTION_TIMEOUT_SECONDS)
            attempted_notes.append("Parsed as plain text after layout repair.")
            return ExtractedDocumentText(text=text, strategy="native_text", notes=attempted_notes)
    except TimeoutError as exc:
        raise DocumentExtractionError(
            code=ErrorCode.ERR_EXTRACTION_TIMEOUT,
            message="Document text extraction took too long to complete safely.",
            user_action="Retry with a shorter or cleaner document export.",
            detail=str(exc),
            retryable=True,
        ) from exc
    except (DocumentExtractionError, PDFExtractionError) as exc:
        attempted_notes.append(f"Native parser fallback triggered after: {exc.code.value}.")
        fallback = await _try_fallback_extractors(file_bytes, filename, kind, attempted_notes)
        if fallback is not None:
            return fallback
        raise

    raise DocumentExtractionError(
        code=ErrorCode.ERR_UNSUPPORTED_FILE_TYPE,
        message="Only PDF, DOCX, and TXT CV uploads are supported right now.",
        user_action="Export the CV as PDF, DOCX, or TXT and upload it again.",
    )


async def _try_fallback_extractors(
    file_bytes: bytes,
    filename: str,
    kind: str,
    attempted_notes: list[str],
) -> ExtractedDocumentText | None:
    if kind == "pdf" and ENABLE_LITEPARSE_FALLBACK:
        try:
            text = await asyncio.wait_for(asyncio.to_thread(_extract_with_liteparse_sync, file_bytes), timeout=EXTRACTION_TIMEOUT_SECONDS)
            return ExtractedDocumentText(
                text=text,
                strategy="liteparse",
                notes=attempted_notes + [
                    "Recovered text with LiteParse fallback using local OCR-aware parsing.",
                ],
            )
        except DocumentExtractionError as exc:
            attempted_notes.append(f"LiteParse fallback did not recover usable text: {exc.code.value}.")

    if DEDOC_URL and kind in {"pdf", "docx"}:
        try:
            text = await asyncio.wait_for(asyncio.to_thread(_extract_with_dedoc_sync, file_bytes, filename), timeout=EXTRACTION_TIMEOUT_SECONDS)
            return ExtractedDocumentText(
                text=text,
                strategy="dedoc",
                notes=attempted_notes + [
                    "Recovered text with Dedoc fallback to preserve document structure.",
                ],
            )
        except DocumentExtractionError as exc:
            attempted_notes.append(f"Dedoc fallback did not recover usable text: {exc.code.value}.")

    return None
