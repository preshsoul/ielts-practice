from __future__ import annotations

import unittest

from backend.cv_extractor.services.sanity_checks import assess_text_for_llm


class TextSanityChecksTests(unittest.TestCase):
    def test_accepts_clean_cv_text_for_llm(self) -> None:
        raw_text = """
        JOHN DOE
        Email: john@example.com
        Phone: +2348000000000

        EDUCATION
        BSc Computer Science, University of Lagos
        First Class Honours
        Graduation Year: 2024

        SKILLS
        Python, React, FastAPI, PostgreSQL, Docker

        EXPERIENCE
        Built admissions and scholarship workflow tools for students.
        """

        report = assess_text_for_llm(raw_text)

        self.assertTrue(report.is_llm_worthy)
        self.assertTrue(report.has_education_signal)
        self.assertTrue(report.has_contact_signal)
        self.assertIn("education", report.section_names)
        self.assertGreaterEqual(report.alpha_ratio, 0.55)

    def test_rejects_short_and_noisy_text(self) -> None:
        raw_text = "## @@ %% 12 44\n?? ?? @@\n12345"

        report = assess_text_for_llm(raw_text)

        self.assertFalse(report.is_llm_worthy)
        self.assertTrue(any("Too little extracted text" in note for note in report.notes))
        self.assertTrue(any("Alphabetic signal is too low" in note for note in report.notes))

    def test_rejects_heavily_repeated_lines(self) -> None:
        repeated_line = "SCANNED PAGE HEADER 2024"
        raw_text = "\n".join([repeated_line] * 12 + [
            "University of Somewhere",
            "BSc Information Technology",
            "Graduation Year: 2022",
        ])

        report = assess_text_for_llm(raw_text)

        self.assertFalse(report.is_llm_worthy)
        self.assertTrue(any("Repeated line share" in note or "unique-line ratio" in note for note in report.notes))

    def test_trims_long_prompt_but_preserves_sections(self) -> None:
        raw_text = "\n".join([
            "EDUCATION",
            "BSc Computer Science",
            "University of Lagos",
            "Graduation Year: 2024",
            "EXPERIENCE",
        ] + ["Worked on backend systems and scholarship tools."] * 2000)

        report = assess_text_for_llm(raw_text)

        self.assertLessEqual(len(report.prompt_text), 16000)
        self.assertIn("EDUCATION", report.prompt_text.upper())


if __name__ == "__main__":
    unittest.main()
