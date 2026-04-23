-- Initial Supabase schema for Loci
-- Based on Loci Technical Spec Sections 4.1-4.5

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Updated profiles table with structured fields from spec Section 4.2
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email_hash text unique,
  device_id text unique,
  consent_sync boolean not null default false,
  consent_at timestamptz,
  is_anonymous boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Structured profile fields
  identity jsonb default '{"nationality": null, "countryOfResidence": null, "ageAtApplicationCycle": null}'::jsonb,
  academic jsonb default '{"degreeClass": null, "institution": null, "institutionCountry": null, "discipline": null, "disciplineCategory": null, "graduationYear": null, "cgpa": null, "cgpaScale": 5.0}'::jsonb,
  professional jsonb default '{"workExperienceYears": 0, "currentlyEmployed": null, "sector": null}'::jsonb,
  languageTests jsonb default '{"ielts": null, "toefl": null, "celpip": null}'::jsonb,
  applicationCycle text,
  targetDegreeLevel text,
  targetDisciplines text[],
  targetCountries text[],
  tier text not null default 'free',
  tierUpgradedAt timestamptz
);

create table if not exists public.passages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  body text not null,
  topic text,
  source text default 'original',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Updated questions table with IELTS fields from spec Section 4.4
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  exam text not null,
  section text not null,
  passage_id uuid references public.passages(id) on delete set null,
  difficulty integer not null check (difficulty between 1 and 3),
  question_text text not null,
  options jsonb not null,
  answer text not null,
  explanation text not null,
  source text default 'static',
  verified boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- IELTS-specific fields
  component text,
  taskType text,
  bandDescriptor text,
  modelAnswer text
);

-- Updated scholarships table with JSONB structure from spec Section 4.1
create table if not exists public.scholarships (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  awardingBody text,
  sourceType text default 'canonical',
  coverage jsonb not null default '{"tuition": false, "living": false, "flights": false, "visaFees": false, "numericAmount": null, "rawAmountString": "", "currency": "GBP"}'::jsonb,
  eligibility jsonb not null default '{"nationalities": [], "degreeClassMin": "", "disciplines": [], "ageLimitMin": null, "ageLimitMax": null, "workExperienceYearsMin": 0, "employmentStatusAtApplication": null, "languageReqs": {"ielts": null, "toefl": null, "celpip": null, "exemptions": []}, "refereesRequired": 0, "refereeCategories": [], "targetInstitutions": [], "targetProgrammes": [], "notes": ""}'::jsonb,
  application jsonb not null default '{"url": "", "portal": "", "applicationOpensAt": null, "deadline": null, "deadlineType": "fixed", "requiredDocuments": [], "essayPrompts": []}'::jsonb,
  provenance jsonb not null default '{"sourceUrl": "", "scrapedAt": null, "lastVerifiedAt": null, "verifiedBy": "", "confidenceScore": 0.5, "confidenceDecayRatePerDay": 0.001, "flaggedFields": [], "sourceType": "canonical"}'::jsonb,
  awardeeContributions jsonb not null default '[]'::jsonb,
  tags text[] default '{}',
  fit_score_default integer,
  source text not null default 'static',
  verified boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Universities table from spec Section 4.5
create table if not exists public.universities (
  id text primary key,
  name text not null,
  aliases text[],
  country text,
  qsRankGlobal integer,
  qsRankYear integer,
  programmes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  client_session_id text unique,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  exam text not null,
  score integer not null,
  total integer not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_secs integer,
  session_data jsonb not null default '{"results":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shortlists (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  scholarship_id uuid not null references public.scholarships(id) on delete cascade,
  notes text,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, scholarship_id)
);

create table if not exists public.cv_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  source_filename text,
  mime_type text,
  document_type text,
  keywords text[] not null default '{}',
  raw_text_hash text,
  extracted_excerpt text,
  extracted_text text,
  parsed_profile jsonb not null default '{}'::jsonb,
  confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Application tracking table from spec Section 4.3
create table if not exists public.application_tracking (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.profiles(id) on delete cascade,
  scholarship_id uuid not null references public.scholarships(id) on delete cascade,
  state text not null default 'saved',
  state_history jsonb not null default '[]'::jsonb,
  state_updated_at timestamptz not null default now(),
  documents_checklist jsonb not null default '{}'::jsonb,
  referees jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, scholarship_id)
);

-- Indexes
create index if not exists idx_questions_exam_section on public.questions (exam, section);
create index if not exists idx_questions_difficulty on public.questions (difficulty);
create index if not exists idx_questions_active on public.questions (active);
create index if not exists idx_passages_active on public.passages (active);
create index if not exists idx_scholarships_slug on public.scholarships (slug);
create index if not exists idx_scholarships_active on public.scholarships (active);
create index if not exists idx_sessions_profile_id on public.practice_sessions (profile_id);
create index if not exists idx_shortlists_profile_id on public.shortlists (profile_id);
create index if not exists idx_cv_profiles_profile_id on public.cv_profiles (profile_id);
create index if not exists idx_application_tracking_candidate on public.application_tracking (candidate_id);
create index if not exists idx_universities_country on public.universities (country);

-- Triggers
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_passages_updated_at on public.passages;
create trigger set_passages_updated_at
before update on public.passages
for each row execute function public.set_updated_at();

drop trigger if exists set_questions_updated_at on public.questions;
create trigger set_questions_updated_at
before update on public.questions
for each row execute function public.set_updated_at();

drop trigger if exists set_scholarships_updated_at on public.scholarships;
create trigger set_scholarships_updated_at
before update on public.scholarships
for each row execute function public.set_updated_at();

drop trigger if exists set_practice_sessions_updated_at on public.practice_sessions;
create trigger set_practice_sessions_updated_at
before update on public.practice_sessions
for each row execute function public.set_updated_at();

drop trigger if exists set_shortlists_updated_at on public.shortlists;
create trigger set_shortlists_updated_at
before update on public.shortlists
for each row execute function public.set_updated_at();

drop trigger if exists set_cv_profiles_updated_at on public.cv_profiles;
create trigger set_cv_profiles_updated_at
before update on public.cv_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_application_tracking_updated_at on public.application_tracking;
create trigger set_application_tracking_updated_at
before update on public.application_tracking
for each row execute function public.set_updated_at();

drop trigger if exists set_universities_updated_at on public.universities;
create trigger set_universities_updated_at
before update on public.universities
for each row execute function public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.passages enable row level security;
alter table public.questions enable row level security;
alter table public.scholarships enable row level security;
alter table public.universities enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.shortlists enable row level security;
alter table public.cv_profiles enable row level security;
alter table public.application_tracking enable row level security;

drop policy if exists "Profiles are owned by the authenticated user" on public.profiles;
create policy "Profiles are owned by the authenticated user"
  on public.profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Passages are publicly readable" on public.passages;
create policy "Passages are publicly readable"
  on public.passages
  for select
  using (active = true);

drop policy if exists "Questions are publicly readable" on public.questions;
create policy "Questions are publicly readable"
  on public.questions
  for select
  using (active = true and verified = true);

drop policy if exists "Scholarships are publicly readable" on public.scholarships;
create policy "Scholarships are publicly readable"
  on public.scholarships
  for select
  using (active = true);

drop policy if exists "Universities are publicly readable" on public.universities;
create policy "Universities are publicly readable"
  on public.universities
  for select
  using (true);

drop policy if exists "Users own their sessions" on public.practice_sessions;
create policy "Users own their sessions"
  on public.practice_sessions
  for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

drop policy if exists "Users own their shortlists" on public.shortlists;
create policy "Users own their shortlists"
  on public.shortlists
  for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

drop policy if exists "Users own their CV profiles" on public.cv_profiles;
create policy "Users own their CV profiles"
  on public.cv_profiles
  for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

drop policy if exists "Users own their application tracking" on public.application_tracking;
create policy "Users own their application tracking"
  on public.application_tracking
  for all
  using (auth.uid() = candidate_id)
  with check (auth.uid() = candidate_id);

-- Read-only progress aggregation for the current profile.
create or replace view public.user_section_accuracy as
select
  ps.profile_id as user_id,
  r.section,
  count(*)::int as total_attempted,
  sum(case when r.correct then 1 else 0 end)::int as total_correct,
  round((sum(case when r.correct then 1 else 0 end)::numeric / nullif(count(*), 0)) * 100, 1) as accuracy_pct
from public.practice_sessions ps
cross join lateral jsonb_to_recordset(coalesce(ps.session_data->'results', '[]'::jsonb)) as r(
  section text,
  correct boolean
)
group by ps.profile_id, r.section;
