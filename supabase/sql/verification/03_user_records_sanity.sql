select
  count(*) as total_shortlists
from public.shortlists;

select
  s.*
from public.shortlists s
left join auth.users u on u.id = s.profile_id
where u.id is null;
