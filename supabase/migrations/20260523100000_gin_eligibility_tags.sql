-- GIN-indexed eligibility_tags for server-side scholarship pre-filtering
-- Enables @> (contains) array queries: WHERE eligibility_tags @> ARRAY['region:uk']

alter table public.scholarships
  add column if not exists eligibility_tags text[] not null default '{}'::text[];

create index if not exists idx_scholarships_eligibility_tags
  on public.scholarships using gin (eligibility_tags);

-- Backfill from existing eligibility JSONB for current records.
-- Only touches rows where eligibility_tags is still the default empty array.
update public.scholarships
set eligibility_tags = array_remove(array[
  case
    when eligibility->>'country' is not null
    then 'region:' || lower(eligibility->>'country')
  end,
  case
    when eligibility->>'discipline' is not null
    then 'discipline:' || lower(eligibility->>'discipline')
  end,
  case
    when eligibility->>'degreeClassMin' is not null
    then 'degree:' || lower(eligibility->>'degreeClassMin')
  end
], null)
where eligibility_tags = '{}'::text[]
  and eligibility is not null;
