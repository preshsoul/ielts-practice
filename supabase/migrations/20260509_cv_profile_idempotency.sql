-- Keep CV/profile document intake idempotent for repeated uploads

create unique index if not exists idx_cv_profiles_profile_hash
  on public.cv_profiles (profile_id, raw_text_hash);
