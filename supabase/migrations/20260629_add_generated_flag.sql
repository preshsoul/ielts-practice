-- Add generated flag to passages table for AI-generated content tracking
alter table if exists public.passages
  add column if not exists generated boolean not null default false;

-- Index for filtering generated vs curated passages
create index if not exists idx_passages_generated
  on public.passages (generated)
  where generated = true;

-- Note: No RLS changes needed. Generated passages with active=true
-- are included in public reads. Generated questions with verified=false
-- are filtered out of the main question bank by existing RLS policy
-- (active = true AND verified = true).
