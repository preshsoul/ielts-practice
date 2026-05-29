-- Access-boundary hardening aligned with ACCESS_CONTROL_MATRIX.md
-- Tightens grants, protects helper functions from accidental RPC exposure,
-- and makes the exposed progress view honor RLS with security_invoker.

-- Public content remains intentionally readable.
revoke all on public.passages from anon;
revoke all on public.questions from anon;
revoke all on public.scholarships from anon;
revoke all on public.universities from anon;

grant select on public.passages to anon, authenticated;
grant select on public.questions to anon, authenticated;
grant select on public.scholarships to anon, authenticated;
grant select on public.universities to anon, authenticated;

-- User-owned tables should never be directly accessible to anon.
revoke all on public.profiles from anon;
revoke all on public.practice_sessions from anon;
revoke all on public.shortlists from anon;
revoke all on public.cv_profiles from anon;
revoke all on public.application_tracking from anon;
revoke all on public.candidate_profiles from anon;
revoke all on public.scholarship_matches from anon;
revoke all on public.match_events from anon;
revoke all on public.cv_parse_jobs from anon;
revoke all on public.cv_profile_drafts from anon;

-- Re-assert authenticated grants explicitly so old project defaults cannot drift.
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.practice_sessions to authenticated;
grant select, insert, update, delete on public.shortlists to authenticated;
grant select, insert, update, delete on public.cv_profiles to authenticated;
grant select, insert, update, delete on public.application_tracking to authenticated;
grant select, insert, update, delete on public.candidate_profiles to authenticated;
grant select, insert, update, delete on public.scholarship_matches to authenticated;
grant select, insert on public.match_events to authenticated;
grant select, insert, update, delete on public.cv_parse_jobs to authenticated;
grant select, insert, update, delete on public.cv_profile_drafts to authenticated;

-- Trigger and helper functions are not part of the public API surface.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.enforce_profile_owned_fields() from public, anon, authenticated;
revoke execute on function public.enforce_application_tracking_workflow() from public, anon, authenticated;

-- Views in exposed schemas should not bypass RLS.
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
