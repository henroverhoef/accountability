-- =====================================================================
-- Account activity: when was each person last active?
-- "Active" = the latest of: account created, app opened (profiles.last_seen_at, set by
-- the app at most every few hours), signed in, a check-in saved, or a prayer/kudos/
-- message sent. Used by the 30-day cleanup (next migration) and the App overview.
-- =====================================================================

alter table public.profiles add column if not exists last_seen_at timestamptz;

-- When was each account last active? (internal: the server and the cleanup use it)
create or replace function public.account_activity()
returns table (user_id uuid, last_active timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, greatest(
    p.created_at,
    p.last_seen_at,
    u.last_sign_in_at,
    (select max(c.updated_at) from public.checkins c where c.user_id = p.id),
    (select max(e.created_at) from public.encouragements e where e.from_user = p.id)
  )
  from public.profiles p join auth.users u on u.id = p.id
$$;

revoke all on function public.account_activity() from public, anon, authenticated;
grant execute on function public.account_activity() to service_role;

-- The App overview shows when each person was last active.
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
        'last_active', a.last_active,
        'is_admin', exists (select 1 from app_admins ad where ad.user_id = p.id),
        'notifications', exists (select 1 from push_subscriptions where user_id = p.id),
        'login_code', p.has_login_code
      ) order by a.last_active desc)
      from profiles p join account_activity() a on a.user_id = p.id), '[]'::jsonb)
  );
end;
$$;

