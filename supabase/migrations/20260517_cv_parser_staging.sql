-- Durable staging for CV parsing drafts and job state.
-- Designed for Supabase Edge Functions so onboarding can recover after refreshes or reconnects.

create table if not exists public.cv_parse_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  phase text not null default 'queued',
  progress integer not null default 0 check (progress between 0 and 100),
  source_filename text,
  mime_type text,
  document_type text,
  source_document_hash text,
  message text not null default 'Upload received.',
  parsed_profile jsonb not null default '{}'::jsonb,
  missing_fields jsonb not null default '[]'::jsonb,
  low_confidence_fields jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error jsonb,
  expires_at timestamptz not null default (now() + interval '1 day'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cv_profile_drafts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  cv_parse_job_id uuid references public.cv_parse_jobs(id) on delete set null,
  source_filename text,
  mime_type text,
  document_type text,
  source_document_hash text,
  profile_json jsonb not null default '{}'::jsonb,
  missing_fields jsonb not null default '[]'::jsonb,
  low_confidence_fields jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '1 day'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cv_parse_jobs_profile_id on public.cv_parse_jobs (profile_id, created_at desc);
create index if not exists idx_cv_parse_jobs_expires_at on public.cv_parse_jobs (expires_at);
create index if not exists idx_cv_parse_jobs_source_hash on public.cv_parse_jobs (profile_id, source_document_hash);

create index if not exists idx_cv_profile_drafts_profile_id on public.cv_profile_drafts (profile_id, created_at desc);
create index if not exists idx_cv_profile_drafts_expires_at on public.cv_profile_drafts (expires_at);
create index if not exists idx_cv_profile_drafts_source_hash on public.cv_profile_drafts (profile_id, source_document_hash);

drop trigger if exists set_cv_parse_jobs_updated_at on public.cv_parse_jobs;
create trigger set_cv_parse_jobs_updated_at
before update on public.cv_parse_jobs
for each row execute function public.set_updated_at();

drop trigger if exists set_cv_profile_drafts_updated_at on public.cv_profile_drafts;
create trigger set_cv_profile_drafts_updated_at
before update on public.cv_profile_drafts
for each row execute function public.set_updated_at();

alter table public.cv_parse_jobs enable row level security;
alter table public.cv_profile_drafts enable row level security;

grant select, insert, update, delete on public.cv_parse_jobs to authenticated;
grant select, insert, update, delete on public.cv_profile_drafts to authenticated;

drop policy if exists "Users own their CV parse jobs" on public.cv_parse_jobs;
create policy "Users own their CV parse jobs"
  on public.cv_parse_jobs
  for all
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = profile_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = profile_id);

drop policy if exists "Users own their CV profile drafts" on public.cv_profile_drafts;
create policy "Users own their CV profile drafts"
  on public.cv_profile_drafts
  for all
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = profile_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = profile_id);
