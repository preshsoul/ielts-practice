select
  count(*) as total_profiles,
  count(*) filter (where id is null) as profiles_missing_id,
  count(*) filter (where targetdegreelevel is null and targetDegreeLevel is null) as missing_target_degree_level,
  count(*) filter (where semantic_text is null and semanticText is null) as missing_semantic_text
from public.profiles;

select
  p.id as profile_id
from public.profiles p
left join auth.users u on u.id = p.id
where u.id is null
order by p.id;
