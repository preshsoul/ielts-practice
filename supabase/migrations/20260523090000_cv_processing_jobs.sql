-- Production-grade CV processing job tracking with Celery integration
-- Supavisor-compatible: no session-level SET or PREPARE statements

do $$ begin
  if not exists (select 1 from pg_type where typname = 'cv_job_status') then
    create type cv_job_status as enum ('queued', 'processing', 'completed', 'failed');
  end if;
end $$;

create table if not exists public.cv_processing_jobs (
  id uuid primary key default gen_random_uuid(),

  -- Core identifiers
  profile_id uuid references public.profiles(id) on delete set null,
  session_id text not null,
  draft_id text not null,

  -- Celery integration
  celery_task_id text unique,
  celery_queue text not null default 'cv_parsing',

  -- Status tracking
  job_status cv_job_status not null default 'queued',

  -- Parsing state (mirrors EventBroker phases for polling compatibility)
  phase text not null default 'queued',
  progress integer not null default 0 check (progress between 0 and 100),
  message text not null default 'Upload received.',

  -- Source document metadata
  source_filename text,
  source_mime_type text,
  document_bytes_hash text,

  -- Results (populated on completion)
  parsed_profile jsonb,
  missing_fields jsonb not null default '[]'::jsonb,
  low_confidence_fields jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,

  -- Error tracking
  error_code text,
  error_message text,
  error_detail text,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  last_retry_at timestamptz,

  -- Timing
  enqueued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for polling and cleanup
create index if not exists idx_cv_processing_jobs_status
  on public.cv_processing_jobs (job_status, enqueued_at desc);
create index if not exists idx_cv_processing_jobs_profile
  on public.cv_processing_jobs (profile_id, enqueued_at desc);
create index if not exists idx_cv_processing_jobs_celery
  on public.cv_processing_jobs (celery_task_id);
create index if not exists idx_cv_processing_jobs_expires
  on public.cv_processing_jobs (expires_at)
  where job_status in ('completed', 'failed');

-- Trigger for automated updated_at
do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_cv_processing_jobs_updated_at'
  ) then
    create trigger set_cv_processing_jobs_updated_at
    before update on public.cv_processing_jobs
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- RLS: authenticated users can only read their own jobs (for the polling endpoint)
alter table public.cv_processing_jobs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'Users can read their own processing jobs'
    and tablename = 'cv_processing_jobs'
  ) then
    create policy "Users can read their own processing jobs"
      on public.cv_processing_jobs
      for select
      to authenticated
      using ((select auth.uid()) = profile_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'Service role manages all processing jobs'
    and tablename = 'cv_processing_jobs'
  ) then
    create policy "Service role manages all processing jobs"
      on public.cv_processing_jobs
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

grant select on public.cv_processing_jobs to authenticated;
grant select, insert, update, delete on public.cv_processing_jobs to service_role;
