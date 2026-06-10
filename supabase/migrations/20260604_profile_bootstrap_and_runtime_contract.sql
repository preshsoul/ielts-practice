-- Profile bootstrap trigger: ensures every auth.users row receives a matching
-- profiles row automatically.  The client upsert in supabaseData.js is kept as a
-- repair/drift path (updates last_seen_at and repairs missing rows) but is no
-- longer authoritative.
--
-- Runtime metadata surface: adds a lightweight verification hook so hosted
-- smoke tests can confirm the trigger is installed and active.

-- ============================================================================
-- 1. Bootstrap trigger function
-- ============================================================================
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    email_hash,
    is_anonymous,
    consent_sync,
    last_seen_at
  )
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))), ''),
    null,
    false,
    false,
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_auth_user_created();

-- ============================================================================
-- 2. Runtime metadata: expose trigger presence for hosted verification
-- ============================================================================
comment on function public.handle_auth_user_created()
  is 'Bootstraps a profiles row for every new auth.users row. Installed by migration 20260604_profile_bootstrap_and_runtime_contract.';

-- Lightweight function that hosted verification can call (via REST) to confirm
-- the bootstrap trigger is installed without needing to create/destroy a user.
create or replace function public.runtime_contract_checks()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'migration_id', '20260604_profile_bootstrap_and_runtime_contract',
    'bootstrap_trigger_installed', exists (
      select 1 from pg_trigger
      where tgname = 'on_auth_user_created'
        and tgrelid = 'auth.users'::regclass
    ),
    'checked_at', now()
  );
$$;
