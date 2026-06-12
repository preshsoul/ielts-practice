-- Add columns that were defined in 20260416_initial_schema.sql's CREATE TABLE
-- but never applied because the profiles table already existed (created by Supabase Auth).
-- PostgreSQL folds unquoted identifiers to lowercase, so applicationCycle -> applicationcycle, etc.

alter table if exists public.profiles
  add column if not exists languageTests jsonb default '{"ielts": null, "toefl": null, "celpip": null}'::jsonb,
  add column if not exists applicationCycle text,
  add column if not exists targetDegreeLevel text,
  add column if not exists targetDisciplines text[],
  add column if not exists targetCountries text[];

-- Reload the PostgREST schema cache so the new columns are recognized immediately
NOTIFY pgrst, 'reload schema';
