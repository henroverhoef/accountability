-- =====================================================================
-- App owner overview: counts, groups and members across the whole app.
-- Only users listed in app_admins can call it. It never returns habit names,
-- check-in answers, tags or notes: just who exists, which groups there are,
-- and when people last checked in.
--
-- Add yourself (once, in the SQL editor):
--   insert into public.app_admins (user_id) values ('<your user id>');
-- =====================================================================

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
-- No policies: nobody can read or change it through the API.
revoke all on public.app_admins from anon, authenticated;

create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  week_ago date := current_date - 7;
begin
  if not public.is_app_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'totals', jsonb_build_object(
      'users', (select count(*) from profiles),
      'groups', (select count(*) from groups),
      'habits', (select count(*) from habits where not archived),
      'checkins', (select count(*) from checkins),
      'checkins_7d', (select count(*) from checkins where date >= week_ago),
      'active_users_7d', (select count(distinct user_id) from checkins where date >= week_ago),
      'push_users', (select count(distinct user_id) from push_subscriptions)
    ),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'created_at', g.created_at,
        'creator', (select display_name from profiles where id = g.created_by),
        'checkins_7d', (select count(*) from checkins c join group_members gm on gm.user_id = c.user_id
                        where gm.group_id = g.id and c.date >= week_ago),
        'members', (select coalesce(jsonb_agg(jsonb_build_object(
            'user_id', gm.user_id,
            'name', p.display_name,
            'role', gm.role,
            'joined_at', gm.joined_at,
            'last_checkin', (select max(date) from checkins where user_id = gm.user_id)
          ) order by gm.joined_at), '[]'::jsonb)
          from group_members gm join profiles p on p.id = gm.user_id where gm.group_id = g.id)
      ) order by g.created_at desc)
      from groups g), '[]'::jsonb),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.id,
        'name', p.display_name,
        'created_at', p.created_at,
        'groups', (select count(*) from group_members where user_id = p.id),
        'habits', (select count(*) from habits where user_id = p.id and not archived),
        'last_checkin', (select max(date) from checkins where user_id = p.id),
        'notifications', exists (select 1 from push_subscriptions where user_id = p.id),
        'login_code', p.has_login_code
      ) order by p.created_at desc)
      from profiles p), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.is_app_admin() from public, anon;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.admin_overview() to authenticated;
