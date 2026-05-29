from __future__ import annotations

import unittest

from backend.cv_extractor.schemas import CvMatchCriteria
from backend.cv_extractor.services.matcher_service import matcher


class DeterministicCvMatcherTests(unittest.TestCase):
    def test_scores_structured_software_cv_highly(self) -> None:
        raw_cv_text = """
        JOHN DOE

        EDUCATION
        BSc Computer Science, University of Lagos
        First Class Honours
        Graduation Year: 2024

        TECHNICAL SKILLS
        Python, React, FastAPI, PostgreSQL, REST APIs, Docker

        EXPERIENCE
        Built scholarship application portals and backend APIs for candidate onboarding.
        """
        criteria = CvMatchCriteria(
            min_graduation_year=2022,
            acceptable_degree_classes=["First Class", "Second Class Upper"],
            job_or_scholarship_description=(
                "Looking for a software engineering candidate with Python, React, FastAPI, PostgreSQL "
                "and strong computer science background."
            ),
        )

        result = matcher.evaluate_candidate(raw_cv_text, criteria)

        self.assertTrue(result.is_eligible)
        self.assertGreater(result.match_confidence_score, 45)
        self.assertEqual(result.extracted_metadata.graduation_year, 2024)
        self.assertEqual(result.extracted_metadata.degree_classification, "First Class")
        self.assertIn("computer science", result.extracted_metadata.detected_disciplines)
        self.assertIn("python", result.matched_signals)

    def test_rejects_candidate_below_degree_threshold(self) -> None:
        raw_cv_text = """
        EDUCATION
        BSc Economics
        Second Class Lower
        Graduation Year: 2021
        """
        criteria = CvMatchCriteria(
            min_graduation_year=2020,
            acceptable_degree_classes=["Second Class Upper"],
            job_or_scholarship_description="Economics scholarship for high-performing graduates.",
        )

        result = matcher.evaluate_candidate(raw_cv_text, criteria)

        self.assertFalse(result.is_eligible)
        self.assertEqual(result.match_confidence_score, 0.0)
        self.assertTrue(any("Degree tier" in flag for flag in result.compliance_flags))

    def test_flags_missing_exam_signal_when_requirement_mentions_ielts(self) -> None:
        raw_cv_text = """
        EDUCATION
        MSc Public Health
        Merit
        Graduation Year: 2023

        EXPERIENCE
        Health program monitoring and evaluation in donor-funded settings.
        """
        criteria = CvMatchCriteria(
            min_graduation_year=2021,
            acceptable_degree_classes=["Merit"],
            job_or_scholarship_description=(
                "Public health scholarship requiring IELTS evidence and strong monitoring experience."
            ),
        )

        result = matcher.evaluate_candidate(raw_cv_text, criteria)

        self.assertTrue(result.is_eligible)
        self.assertIn("IELTS", result.missing_signals)
        self.assertTrue(any("IELTS" in flag for flag in result.compliance_flags))


if __name__ == "__main__":
    unittest.main()
