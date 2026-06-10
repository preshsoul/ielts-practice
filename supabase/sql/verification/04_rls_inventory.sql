select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname in ('public')
order by schemaname, tablename;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where schemaname in ('public')
order by schemaname, tablename, policyname;
