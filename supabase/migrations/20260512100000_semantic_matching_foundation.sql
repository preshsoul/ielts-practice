-- Semantic matching foundation
-- Safe, additive migration: preserves existing tables and policies, adds canonical candidate and match storage,
-- and prepares scholarships for embedding-backed retrieval without changing current live behavior.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- Canonical live candidate snapshot used by the matcher.
create table if not exists public.candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null default 'merged',
  semantic_text text,
  canonical_json jsonb not null default '{}'::jsonb,
  confidence_json jsonb not null default '{}'::jsonb,
  embedding_model text,
  embedding extensions.vector(1536),
  last_cv_profile_id uuid references public.cv_profiles(id) on delete set null,
  source_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id)
);

-- Cached ranking output for a given candidate + scholarship pair.
create table if not exists public.scholarship_matches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  candidate_profile_id uuid references public.candidate_profiles(id) on delete set null,
  scholarship_id uuid not null references public.scholarships(id) on delete cascade,
  semantic_score numeric(5,4) not null default 0,
  eligibility_score numeric(5,4) not null default 0,
  coverage_score numeric(5,4) not null default 0,
  deadline_score numeric(5,4) not null default 0,
  source_confidence_score numeric(5,4) not null default 0,
  document_burden_score numeric(5,4) not null default 0,
  final_score numeric(5,4) not null default 0,
  match_status text not null default 'possible',
  blocking_reasons text[] not null default '{}'::text[],
  explanation_json jsonb not null default '{}'::jsonb,
  model_version text not null default 'v1',
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, scholarship_id)
);

-- Event log for ranking feedback and learning signals.
create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  candidate_profile_id uuid references public.candidate_profiles(id) on delete set null,
  scholarship_id uuid references public.scholarships(id) on delete cascade,
  match_id uuid references public.scholarship_matches(id) on delete set null,
  event_type text not null,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.scholarships
  add column if not exists search_text text,
  add column if not exists semantic_tags text[] not null default '{}'::text[],
  add column if not exists content_embedding extensions.vector(1536),
  add column if not exists embedding_model text,
  add column if not exists embedding_updated_at timestamptz,
  add column if not exists content_fingerprint text;

create index if not exists idx_candidate_profiles_profile_id on public.candidate_profiles (profile_id);
create index if not exists idx_candidate_profiles_embedding on public.candidate_profiles using ivfflat (embedding vector_cosine_ops) with (lists = 10);

create index if not exists idx_scholarships_content_embedding on public.scholarships using ivfflat (content_embedding vector_cosine_ops) with (lists = 50);
create index if not exists idx_scholarships_content_fingerprint on public.scholarships (content_fingerprint);

create index if not exists idx_scholarship_matches_profile_id on public.scholarship_matches (profile_id);
create index if not exists idx_scholarship_matches_scholarship_id on public.scholarship_matches (scholarship_id);
create index if not exists idx_scholarship_matches_rank on public.scholarship_matches (profile_id, final_score desc, retrieved_at desc);

create index if not exists idx_match_events_profile_id on public.match_events (profile_id, created_at desc);
create index if not exists idx_match_events_type on public.match_events (event_type, created_at desc);

drop trigger if exists set_candidate_profiles_updated_at on public.candidate_profiles;
create trigger set_candidate_profiles_updated_at
before update on public.candidate_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_scholarship_matches_updated_at on public.scholarship_matches;
create trigger set_scholarship_matches_updated_at
before update on public.scholarship_matches
for each row execute function public.set_updated_at();

alter table public.candidate_profiles enable row level security;
alter table public.scholarship_matches enable row level security;
alter table public.match_events enable row level security;

grant select, insert, update, delete on public.candidate_profiles to authenticated;
grant select, insert, update, delete on public.scholarship_matches to authenticated;
grant select, insert on public.match_events to authenticated;

drop policy if exists "Users own their candidate profiles" on public.candidate_profiles;
create policy "Users own their candidate profiles"
  on public.candidate_profiles
  for all
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = profile_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = profile_id);

drop policy if exists "Users own their scholarship matches" on public.scholarship_matches;
create policy "Users own their scholarship matches"
  on public.scholarship_matches
  for all
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = profile_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = profile_id);

drop policy if exists "Users can log their match events" on public.match_events;
create policy "Users can log their match events"
  on public.match_events
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = profile_id);

drop policy if exists "Users can read their match events" on public.match_events;
create policy "Users can read their match events"
  on public.match_events
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = profile_id);
