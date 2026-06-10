select
  count(*) as total_jobs,
  count(*) filter (where status in ('queued', 'processing')) as active_jobs,
  count(*) filter (where status = 'failed') as failed_jobs,
  count(*) filter (where parsed_candidate_profile is null) as jobs_missing_canonical_profile
from public.cv_parse_jobs;

select
  id,
  profile_id,
  status,
  created_at,
  updated_at
from public.cv_parse_jobs
where status in ('queued', 'processing')
  and created_at < now() - interval '30 minutes'
order by created_at asc;

select
  draft.id as draft_id,
  draft.profile_id,
  draft.created_at
from public.cv_profile_drafts draft
left join auth.users u on u.id = draft.profile_id
where u.id is null
order by draft.created_at desc;
