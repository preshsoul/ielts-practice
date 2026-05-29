-- Wave 1: Canonical CV Contract & Schema Unification
-- Adds parsed_candidate_profile (JSONB) to cv_profiles and cv_profile_drafts
-- Adds parser provenance tracking
-- Drops the redundant cv_processing_jobs table (keeps cv_parse_jobs as canonical)

-- ── cv_profiles: add canonical rich profile column + provenance ──

alter table public.cv_profiles
  add column if not exists parsed_candidate_profile jsonb not null default '{}'::jsonb,
  add column if not exists parser_version text,
  add column if not exists parser_method text,
  add column if not exists parser_model text,
  add column if not exists parsed_at timestamptz;

-- ── cv_profile_drafts: add canonical rich profile column ──

alter table public.cv_profile_drafts
  add column if not exists parsed_candidate_profile jsonb not null default '{}'::jsonb;

-- ── Index on the new column for matcher queries ──

create index if not exists idx_cv_profiles_parsed_candidate
  on public.cv_profiles using gin (parsed_candidate_profile jsonb_path_ops);

-- ── Drop the redundant third job table (cv_processing_jobs) ──
-- Supabase canonical job tracking is public.cv_parse_jobs (id uuid, profile_id uuid).
-- The Python backend's private cv_processing_jobs table with session_id/celery_task_id
-- is no longer needed now that Python is fully deprecated.

drop table if exists public.cv_processing_jobs cascade;
drop type if exists public.cv_job_status cascade;

-- ── Mark Python backend's job_store.py as deprecated ──
-- backend/cv_extractor/job_store.py defines its own job_id text / session_id schema.
-- It must NOT create or write tables directly into Supabase; the cv-parser Edge Function
-- is now the sole writer of public.cv_parse_jobs and public.cv_profile_drafts.
-- If the Python backend is still running, point it at a local SQLite file or a
-- separate staging database — never at the Supabase production schema.

-- ── Add parser_version tracking to cv_parse_jobs ──

alter table public.cv_parse_jobs
  add column if not exists parser_version text not null default 'cv-parser-v2',
  add column if not exists parser_model text;
