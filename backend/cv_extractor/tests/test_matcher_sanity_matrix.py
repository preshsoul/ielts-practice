from __future__ import annotations

import unittest

from backend.cv_extractor.schemas import CvMatchCriteria
from backend.cv_extractor.services.matcher_service import matcher


class MatcherSanityMatrixTests(unittest.TestCase):
    def test_sanity_matrix(self) -> None:
        scenarios = [
            {
                "name": "software-good-fit",
                "cv": """
                EDUCATION
                BSc Software Engineering
                First Class Honours
                Graduation Year: 2024

                SKILLS
                Python, React, FastAPI, PostgreSQL, Docker

                EXPERIENCE
                Built scholarship matching APIs and applicant dashboards.
                """,
                "criteria": CvMatchCriteria(
                    min_graduation_year=2022,
                    acceptable_degree_classes=["Second Class Upper"],
                    job_or_scholarship_description="Software engineering role requiring Python, React, FastAPI and PostgreSQL.",
                ),
                "eligible": True,
                "min_score": 45,
            },
            {
                "name": "discipline-mismatch",
                "cv": """
                EDUCATION
                BSc Agriculture
                Second Class Upper
                Graduation Year: 2024

                EXPERIENCE
                Farm extension and agronomy support.
                """,
                "criteria": CvMatchCriteria(
                    min_graduation_year=2022,
                    acceptable_degree_classes=["Second Class Upper"],
                    job_or_scholarship_description="Computer science scholarship for backend engineering and data systems.",
                ),
                "eligible": True,
                "max_score": 35,
            },
            {
                "name": "old-graduation-year",
                "cv": """
                EDUCATION
                BSc Economics
                First Class
                Graduation Year: 2016
                """,
                "criteria": CvMatchCriteria(
                    min_graduation_year=2020,
                    acceptable_degree_classes=["Second Class Upper"],
                    job_or_scholarship_description="Economics scholarship for recent graduates.",
                ),
                "eligible": False,
                "exact_score": 0,
            },
            {
                "name": "exam-present",
                "cv": """
                EDUCATION
                MSc Public Health
                Merit
                Graduation Year: 2023

                IELTS Overall Band: 8.0

                EXPERIENCE
                Monitoring and evaluation for public health interventions.
                """,
                "criteria": CvMatchCriteria(
                    min_graduation_year=2021,
                    acceptable_degree_classes=["Merit"],
                    job_or_scholarship_description="Public health scholarship requiring IELTS and monitoring experience.",
                ),
                "eligible": True,
                "min_score": 35,
                "must_match": "IELTS",
            },
        ]

        for scenario in scenarios:
            with self.subTest(scenario["name"]):
                result = matcher.evaluate_candidate(scenario["cv"], scenario["criteria"])
                self.assertEqual(result.is_eligible, scenario["eligible"])
                if "min_score" in scenario:
                    self.assertGreaterEqual(result.match_confidence_score, scenario["min_score"])
                if "max_score" in scenario:
                    self.assertLessEqual(result.match_confidence_score, scenario["max_score"])
                if "exact_score" in scenario:
                    self.assertEqual(result.match_confidence_score, scenario["exact_score"])
                if "must_match" in scenario:
                    self.assertIn(scenario["must_match"], result.matched_signals)


if __name__ == "__main__":
    unittest.main()
