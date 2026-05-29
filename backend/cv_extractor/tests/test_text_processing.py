from __future__ import annotations

import unittest

from backend.cv_extractor.services.text_processing import repair_extracted_layout, split_sections


class TextProcessingTests(unittest.TestCase):
    def test_repairs_hyphenated_line_breaks(self) -> None:
        raw_text = "Com-\nputer Science\nExperi-\nence building APIs"

        repaired = repair_extracted_layout(raw_text)

        self.assertIn("Computer Science", repaired)
        self.assertIn("Experience building APIs", repaired)

    def test_splits_common_cv_sections(self) -> None:
        raw_text = """
        SUMMARY
        Backend engineer focused on academic tooling.

        EDUCATION
        BSc Computer Science

        TECHNICAL SKILLS
        Python, FastAPI, PostgreSQL

        EXPERIENCE
        Built applicant matching systems.
        """

        sections = split_sections(raw_text)

        self.assertIn("summary", sections)
        self.assertIn("education", sections)
        self.assertIn("skills", sections)
        self.assertIn("experience", sections)
        self.assertIn("BSc Computer Science", sections["education"])


if __name__ == "__main__":
    unittest.main()
