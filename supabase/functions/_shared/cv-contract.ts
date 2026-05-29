/**
 * Canonical CV contract — the single source of truth for parsed candidate profiles.
 * Every layer (browser → Edge Function → DB → matcher) speaks this dialect.
 */
export const PARSER_CONTRACT_VERSION = "cv-parser-v2";

export interface ControlledValue {
  id: string | null;
  label: string | null;
  raw_text: string | null;
}

export interface AcademicRecord {
  institution: string | null;
  institution_country: string | null;
  degree_type: string | null;
  academic_discipline: string | null;
  degree_class: ControlledValue | null;
  graduation_date: string | null; // ISO-8601 date
  graduation_year: number | null;
  cgpa: number | null;
  cgpa_scale: number | null;
}

export interface GradeEvidence {
  scheme: "degree_class" | "cgpa" | "other";
  normalized: string | null; // e.g. "Second Class Upper"
  raw: string | null; // e.g. "2:1"
  cgpa: number | null;
  scale: number | null; // e.g. 5.0 or 4.0
}

export interface PersonalDetails {
  full_legal_name: string | null;
  email: string | null;
  phone: string | null;
  nationality: ControlledValue | null;
  country_of_residence: ControlledValue | null;
}

export interface LanguageTestScores {
  ielts_band_score: number | null;
  toefl_score: number | null;
  celpip_score: number | null;
}

export interface ParsedCandidateProfile {
  personal_details: PersonalDetails;
  academic_history: AcademicRecord[];
  professional_experience_years: number | null;
  international_exams: LanguageTestScores;
  grade: GradeEvidence;
  keywords: string[];
  raw_text_snippet: string | null;
}

export interface ParserProvenance {
  parser_version: string;
  method: string;
  model: string | null;
  parsed_at: string; // ISO-8601
}

export interface CanonicalCvPayload {
  label: string | null;
  source_filename: string | null;
  mime_type: string | null;
  document_type: string | null;
  raw_text_hash: string | null;
  extracted_excerpt: string | null;
  extracted_text: string | null;
  keywords: string[];
  // Legacy flat profile — kept for existing consumers during migration
  parsed_profile: Record<string, unknown>;
  // Canonical rich profile — the durable contract
  parsed_candidate_profile: ParsedCandidateProfile;
  confidence: number;
  provenance: ParserProvenance;
}
