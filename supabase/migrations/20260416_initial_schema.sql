-- Initial Supabase schema for IELTS Practice & Scholarship Tools
-- This schema keeps Supabase auth as the source of identity and stores
-- app-specific profile data in public.profiles.

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
  updated_at timestamptz not null default now()
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
  updated_at timestamptz not null default now()
);

create table if not exists public.scholarships (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution text not null,
  region text not null,
  amount_min_gbp integer,
  amount_max_gbp integer,
  coverage text,
  deadline date,
  deadline_notes text,
  status text not null,
  eligibility text,
  blockers text,
  sequence text,
  stackable text,
  direct_url text,
  notes text,
  tags text[] default '{}',
  fit_score_default integer,
  source text not null default 'static',
  verified boolean not null default true,
  active boolean not null default true,
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
  keywords text[] not null default '{}',
  raw_text_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_questions_exam_section on public.questions (exam, section);
create index if not exists idx_questions_difficulty on public.questions (difficulty);
create index if not exists idx_questions_active on public.questions (active);
create index if not exists idx_passages_active on public.passages (active);
create index if not exists idx_scholarships_region on public.scholarships (region);
create index if not exists idx_scholarships_status on public.scholarships (status);
create index if not exists idx_scholarships_tags on public.scholarships using gin (tags);
create index if not exists idx_scholarships_amount_max on public.scholarships (amount_max_gbp);
create index if not exists idx_sessions_profile_id on public.practice_sessions (profile_id);
create index if not exists idx_shortlists_profile_id on public.shortlists (profile_id);
create index if not exists idx_cv_profiles_profile_id on public.cv_profiles (profile_id);

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

alter table public.profiles enable row level security;
alter table public.passages enable row level security;
alter table public.questions enable row level security;
alter table public.scholarships enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.shortlists enable row level security;
alter table public.cv_profiles enable row level security;

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

-- Safer than a trigger-based materialized view refresh for now.
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
