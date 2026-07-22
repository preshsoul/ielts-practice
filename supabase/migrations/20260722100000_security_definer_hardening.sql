-- Closes three findings from Supabase's advisors that survived the
-- 20260522 access-boundary hardening pass:
--
-- 1. function_search_path_mutable — set_updated_at, enforce_profile_owned_fields,
--    and enforce_application_tracking_workflow were created before this project's
--    convention of pinning `search_path` on SECURITY DEFINER / trigger functions
--    was adopted (see handle_auth_user_created in 20260604 for the convention).
--    A mutable search_path lets a caller with schema-creation rights shadow an
--    unqualified reference inside the function body; pinning it closes that.
--
-- 2. anon/authenticated_security_definer_function_executable — handle_auth_user_created
--    is a trigger-only function (auth.users insert). It has no legitimate reason to be
--    directly callable via PostgREST RPC, the same reasoning 20260522 already applied
--    to set_updated_at and friends.
--
-- 3. Same lint for runtime_contract_checks — its own comment describes it as callable
--    "via REST" for hosted verification, but nothing in this codebase actually calls it
--    (grepped: zero references outside its own migration). Revoking public execute now;
--    if a real hosted-verification consumer is built later, grant execute back explicitly
--    at that time with that caller in mind, rather than leaving unused public exposure
--    "just in case."
--
-- All statements below are idempotent / safe to re-run.

alter function public.set_updated_at() set search_path = public;
alter function public.enforce_profile_owned_fields() set search_path = public;
alter function public.enforce_application_tracking_workflow() set search_path = public;

revoke execute on function public.handle_auth_user_created() from public, anon, authenticated;
revoke execute on function public.runtime_contract_checks() from public, anon, authenticated;

-- Re-assert the security_invoker view exactly as 20260522 defined it, in case the
-- live definition ever drifted from this file (the security_definer_view advisor
-- finding for this view should already be resolved by 20260522 — this is a
-- no-op if so, and a correction if the live state somehow diverged).
drop view if exists public.user_section_accuracy;
create view public.user_section_accuracy
with (security_invoker = true) as
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
where ps.profile_id = auth.uid()
group by ps.profile_id, r.section;

revoke all on public.user_section_accuracy from anon;
grant select on public.user_section_accuracy to authenticated;
