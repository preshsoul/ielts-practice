select
  count(*) as total_users,
  count(*) filter (where email is null or trim(email) = '') as users_missing_email,
  count(*) filter (where email is not null and email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') as malformed_email_users,
  count(*) filter (where deleted_at is not null) as soft_deleted_users
from auth.users;

select
  email,
  count(*) as duplicate_count
from auth.users
where email is not null
group by email
having count(*) > 1
order by duplicate_count desc, email;
