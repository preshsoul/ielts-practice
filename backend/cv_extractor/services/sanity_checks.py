from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

from backend.cv_extractor.services.text_processing import repair_extracted_layout, split_sections


MIN_LLM_TEXT_CHARS = int(os.getenv("CV_LLM_MIN_TEXT_CHARS", "250"))
MAX_LLM_TEXT_CHARS = int(os.getenv("CV_LLM_MAX_TEXT_CHARS", "16000"))
MIN_ALPHA_RATIO = float(os.getenv("CV_LLM_MIN_ALPHA_RATIO", "0.55"))
MAX_SUSPICIOUS_CHAR_RATIO = float(os.getenv("CV_LLM_MAX_SUSPICIOUS_RATIO", "0.18"))
MIN_UNIQUE_LINE_RATIO = float(os.getenv("CV_LLM_MIN_UNIQUE_LINE_RATIO", "0.45"))
MAX_DUPLICATE_LINE_SHARE = float(os.getenv("CV_LLM_MAX_DUPLICATE_LINE_SHARE", "0.45"))

EDUCATION_SIGNAL = re.compile(
    r"\b(bsc|msc|phd|bachelor|master|university|college|cgpa|gpa|graduation|degree|honours|honors)\b",
    re.I,
)
CONTACT_SIGNAL = re.compile(
    r"[@+]|(?:\b(?:email|phone|mobile|linkedin)\b)",
    re.I,
)
SUSPICIOUS_CHAR = re.compile(r"[^A-Za-z0-9\s.,;:()@/+&%#'\"_-]")


@dataclass(slots=True)
class TextSanityReport:
    is_llm_worthy: bool
    cleaned_text: str
    prompt_text: str
    character_count: int
    line_count: int
    token_count: int
    unique_line_ratio: float
    duplicate_line_share: float
    alpha_ratio: float
    suspicious_char_ratio: float
    has_education_signal: bool
    has_contact_signal: bool
    section_names: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def assess_text_for_llm(raw_text: str) -> TextSanityReport:
    cleaned = repair_extracted_layout(raw_text)
    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    token_count = len(re.findall(r"\b\w+\b", cleaned))
    alpha_count = sum(1 for char in cleaned if char.isalpha())
    visible_count = sum(1 for char in cleaned if not char.isspace())
    suspicious_count = len(SUSPICIOUS_CHAR.findall(cleaned))
    unique_lines = len(set(lines))
    duplicate_lines = max(0, len(lines) - unique_lines)
    unique_line_ratio = unique_lines / max(1, len(lines))
    duplicate_line_share = duplicate_lines / max(1, len(lines))
    alpha_ratio = alpha_count / max(1, visible_count)
    suspicious_ratio = suspicious_count / max(1, visible_count)
    sections = split_sections(cleaned)
    notes: list[str] = []

    if len(cleaned) < MIN_LLM_TEXT_CHARS:
        notes.append(f"Too little extracted text for reliable structured parsing ({len(cleaned)} chars).")
    if alpha_ratio < MIN_ALPHA_RATIO:
        notes.append(f"Alphabetic signal is too low ({alpha_ratio:.2f}), which usually means OCR noise or broken extraction.")
    if suspicious_ratio > MAX_SUSPICIOUS_CHAR_RATIO:
        notes.append(f"Suspicious character ratio is too high ({suspicious_ratio:.2f}).")
    if unique_line_ratio < MIN_UNIQUE_LINE_RATIO:
        notes.append(f"Too many repeated lines after extraction ({unique_line_ratio:.2f} unique-line ratio).")
    if duplicate_line_share > MAX_DUPLICATE_LINE_SHARE:
        notes.append(f"Repeated line share is too high ({duplicate_line_share:.2f}).")

    has_education_signal = bool(EDUCATION_SIGNAL.search(cleaned))
    has_contact_signal = bool(CONTACT_SIGNAL.search(cleaned))
    if not has_education_signal:
        notes.append("No clear education signal detected in the extracted CV text.")

    prompt_text = _trim_for_prompt(cleaned, sections)
    is_llm_worthy = not notes

    return TextSanityReport(
        is_llm_worthy=is_llm_worthy,
        cleaned_text=cleaned,
        prompt_text=prompt_text,
        character_count=len(cleaned),
        line_count=len(lines),
        token_count=token_count,
        unique_line_ratio=unique_line_ratio,
        duplicate_line_share=duplicate_line_share,
        alpha_ratio=alpha_ratio,
        suspicious_char_ratio=suspicious_ratio,
        has_education_signal=has_education_signal,
        has_contact_signal=has_contact_signal,
        section_names=sorted(sections.keys()),
        notes=notes,
    )


def _trim_for_prompt(cleaned_text: str, sections: dict[str, str]) -> str:
    if len(cleaned_text) <= MAX_LLM_TEXT_CHARS:
        return cleaned_text

    prioritized: list[str] = []
    for key in ("contact", "summary", "education", "skills", "experience", "projects", "general"):
        value = sections.get(key)
        if value:
            prioritized.append(f"[{key.upper()}]\n{value}")

    merged = "\n\n".join(prioritized).strip() or cleaned_text
    if len(merged) <= MAX_LLM_TEXT_CHARS:
        return merged

    head_budget = int(MAX_LLM_TEXT_CHARS * 0.7)
    tail_budget = MAX_LLM_TEXT_CHARS - head_budget - len("\n\n[TRUNCATED]\n\n")
    return f"{merged[:head_budget].rstrip()}\n\n[TRUNCATED]\n\n{merged[-tail_budget:].lstrip()}"
