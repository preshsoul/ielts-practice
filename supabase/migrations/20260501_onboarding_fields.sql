-- Minimal onboarding fields for the Loci dashboard gate

alter table if exists public.profiles
  add column if not exists target_band numeric(2,1),
  add column if not exists self_assessment jsonb not null default '{"reading":null,"listening":null,"writing":null,"speaking":null}'::jsonb,
  add column if not exists test_date date,
  add column if not exists target_modules text[] not null default '{}'::text[],
  add column if not exists onboarding_completed boolean not null default false;

