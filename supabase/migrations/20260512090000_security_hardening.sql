-- Security hardening for profile-owned fields and workflow integrity.

create or replace function public.enforce_profile_owned_fields()
returns trigger
language plpgsql
as $$
declare
  onboarding_complete boolean;
begin
  if auth.uid() is not null and new.id is distinct from auth.uid() then
    raise exception 'profile id must match the authenticated user';
  end if;

  onboarding_complete :=
    coalesce(new.target_band, null) is not null
    and coalesce(new.test_date, null) is not null
    and coalesce(nullif(trim(coalesce(new.self_assessment->>'reading', '')), ''), null) is not null
    and coalesce(nullif(trim(coalesce(new.self_assessment->>'listening', '')), ''), null) is not null
    and coalesce(nullif(trim(coalesce(new.self_assessment->>'writing', '')), ''), null) is not null
    and coalesce(nullif(trim(coalesce(new.self_assessment->>'speaking', '')), ''), null) is not null;

  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.tier := 'free';
      new.onboarding_completed := onboarding_complete;
      new.last_seen_at := coalesce(new.last_seen_at, now());
      return new;
    end if;

    new.email_hash := old.email_hash;
    new.device_id := old.device_id;
    new.tier := old.tier;
    new.onboarding_completed := onboarding_complete;
    new.last_seen_at := coalesce(new.last_seen_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_owned_fields on public.profiles;
create trigger protect_profile_owned_fields
before insert or update on public.profiles
for each row execute function public.enforce_profile_owned_fields();

create or replace function public.enforce_application_tracking_workflow()
returns trigger
language plpgsql
as $$
declare
  allowed_states text[];
begin
  if auth.uid() is not null and new.candidate_id is distinct from auth.uid() then
    raise exception 'candidate_id must match the authenticated user';
  end if;

  new.state := lower(btrim(coalesce(new.state, 'saved')));
  new.state_updated_at := now();

  if tg_op = 'INSERT' then
    if new.state not in ('saved', 'drafting') then
      raise exception 'invalid application state on insert';
    end if;

    new.state_history := jsonb_build_array(
      jsonb_build_object('state', new.state, 'at', now(), 'source', 'server')
    );
    return new;
  end if;

  allowed_states := case lower(btrim(coalesce(old.state, 'saved')))
    when 'saved' then array['drafting', 'submitted', 'rejected']
    when 'drafting' then array['saved', 'submitted', 'rejected']
    when 'submitted' then array['drafting', 'interview', 'awarded', 'rejected']
    when 'interview' then array['submitted', 'awarded', 'rejected']
    when 'awarded' then array[]::text[]
    when 'rejected' then array[]::text[]
    else array[]::text[]
  end;

  if new.state = lower(btrim(coalesce(old.state, 'saved'))) then
    new.state_history := coalesce(old.state_history, '[]'::jsonb);
    return new;
  end if;

  if not (new.state = any(allowed_states)) then
    raise exception 'invalid application transition from % to %', old.state, new.state;
  end if;

  new.state_history := coalesce(old.state_history, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object('state', new.state, 'at', now(), 'source', 'server')
  );

  return new;
end;
$$;

drop trigger if exists protect_application_tracking_workflow on public.application_tracking;
create trigger protect_application_tracking_workflow
before insert or update on public.application_tracking
for each row execute function public.enforce_application_tracking_workflow();

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
where ps.profile_id = auth.uid()
group by ps.profile_id, r.section;
