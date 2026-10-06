-- =====================================================================
-- Steadfast – Phase 3: accountability groups, sharing, encouragement, SOS
--
-- PRIVACY MODEL
-- * Other people can NEVER read your habits, check-ins or profile tables directly.
--   The RLS policies from Phase 1 only allow the owner.
-- * Group members see your data ONLY through group_overview() below, a function that
--   checks membership and returns, per shared habit, exactly what you allowed:
--     'checkin' → that you checked in (no outcome)
--     'result'  → outcome + streak
--     'notes'   → outcome + tags + note
--   No row in habit_shares = private.
-- =====================================================================

-- ---------- tables ------------------------------------------------------
create function public.new_invite_code() returns text language sql volatile as $$
  -- 8 characters without look-alikes (no 0/O, 1/I/L)
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 8)
$$;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 50),
  invite_code text not null unique default public.new_invite_code(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members(user_id);

create table public.habit_shares (
  habit_id uuid not null references public.habits(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  visibility text not null check (visibility in ('checkin', 'result', 'notes')),
  primary key (habit_id, group_id)
);
create index habit_shares_group_idx on public.habit_shares(group_id);

create table public.encouragements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  from_user uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_user uuid references auth.users(id) on delete cascade,     -- null = to the whole group
  checkin_id uuid references public.checkins(id) on delete set null,
  kind text not null check (kind in ('prayer', 'message', 'sos')),
  message text check (char_length(message) <= 280),
  created_at timestamptz not null default now()
);
create index encouragements_group_idx on public.encouragements(group_id, created_at desc);

-- ---------- helper checks (security definer avoids RLS recursion) ---------
create function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid())
$$;

create function public.is_group_admin(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid() and role = 'admin')
$$;

create function public.is_member_of(gid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = uid)
$$;

-- Is this check-in by `uid` on a habit that `uid` shares with group `gid`?
create function public.checkin_shared_in_group(cid uuid, gid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.checkins c join public.habit_shares s on s.habit_id = c.habit_id
    where c.id = cid and c.user_id = uid and s.group_id = gid)
$$;

-- ---------- RLS -------------------------------------------------------------
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.habit_shares enable row level security;
alter table public.encouragements enable row level security;

create policy "groups: members read" on public.groups
  for select using (public.is_group_member(id));
create policy "groups: admin rename" on public.groups
  for update using (public.is_group_admin(id)) with check (public.is_group_admin(id));
create policy "groups: admin delete" on public.groups
  for delete using (public.is_group_admin(id));
-- (creating and joining go through create_group() / join_group() below)

create policy "group_members: members read" on public.group_members
  for select using (public.is_group_member(group_id));
create policy "group_members: leave or admin removes" on public.group_members
  for delete using (user_id = auth.uid() or public.is_group_admin(group_id));

create policy "habit_shares: owner manages" on public.habit_shares
  for all using (exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()))
  with check (
    exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
    and public.is_group_member(group_id)
  );

-- Prayers, SOS and group-wide messages are visible to the group.
-- A message to one person is only visible to sender and recipient.
create policy "encouragements: members read" on public.encouragements
  for select using (
    public.is_group_member(group_id)
    and (kind <> 'message' or to_user is null or to_user = auth.uid() or from_user = auth.uid())
  );
create policy "encouragements: members send" on public.encouragements
  for insert with check (
    from_user = auth.uid()
    and public.is_group_member(group_id)
    and (to_user is null or (to_user <> auth.uid() and public.is_member_of(group_id, to_user)))
    and (checkin_id is null or public.checkin_shared_in_group(checkin_id, group_id, to_user))
  );
create policy "encouragements: sender deletes" on public.encouragements
  for delete using (from_user = auth.uid());

-- ---------- group management functions ---------------------------------------
create function public.create_group(p_name text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.groups (name, created_by) values (trim(p_name), auth.uid()) returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, auth.uid(), 'admin');
  return g;
end $$;

create function public.join_group(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into gid from public.groups where invite_code = upper(trim(p_code));
  if gid is null then raise exception 'That invite code doesn''t match any group'; end if;
  insert into public.group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end $$;

create function public.regenerate_invite_code(gid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not public.is_group_admin(gid) then raise exception 'only the group admin can do this'; end if;
  update public.groups set invite_code = public.new_invite_code() where id = gid returning invite_code into code;
  return code;
end $$;

-- When someone leaves (or is removed): stop sharing their habits with that group,
-- make sure the group still has an admin, and delete empty groups.
create function public.after_member_removed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.habit_shares s using public.habits h
    where s.habit_id = h.id and h.user_id = old.user_id and s.group_id = old.group_id;
  if not exists (select 1 from public.group_members where group_id = old.group_id) then
    delete from public.groups where id = old.group_id;
  elsif not exists (select 1 from public.group_members where group_id = old.group_id and role = 'admin') then
    update public.group_members set role = 'admin'
      where (group_id, user_id) = (
        select group_id, user_id from public.group_members where group_id = old.group_id order by joined_at limit 1);
  end if;
  return old;
end $$;

create trigger group_member_removed after delete on public.group_members
  for each row execute function public.after_member_removed();

-- ---------- the ONLY way to see other people's data -----------------------------
-- Returns everything the group page needs, already filtered by each person's choices.
create function public.group_overview(gid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_group_member(gid) then raise exception 'not a member of this group'; end if;

  with members as (
    select m.user_id, m.role, m.joined_at, p.display_name, public.user_today(m.user_id) as today
    from public.group_members m join public.profiles p on p.id = m.user_id
    where m.group_id = gid
  ),
  member_status as (
    select mb.*,
      (select max(c.date) from public.checkins c where c.user_id = mb.user_id) as last_checkin_date,
      -- habits due today that are not yet checked in (count only; names stay private)
      (select count(*) from public.habits h
        where h.user_id = mb.user_id and not h.archived and h.start_date <= mb.today
          and extract(dow from mb.today)::int = any(h.schedule_days)) as due_today,
      (select count(*) from public.habits h join public.checkins c on c.habit_id = h.id and c.date = mb.today
        where h.user_id = mb.user_id and not h.archived and h.start_date <= mb.today
          and extract(dow from mb.today)::int = any(h.schedule_days)) as done_today
    from members mb
  ),
  shared as (
    select h.id, h.user_id, h.name, h.icon, h.type, h.schedule_days, h.start_date, h.outcome_options,
           h.unit, h.target_value, h.target_direction, h.target_time, s.visibility
    from public.habit_shares s join public.habits h on h.id = s.habit_id
    where s.group_id = gid and not h.archived and public.is_member_of(gid, h.user_id)
  ),
  shared_checkins as (
    select c.id, c.habit_id, c.user_id, c.date,
      case when sh.visibility in ('result', 'notes') then c.outcome end as outcome,
      case when sh.visibility in ('result', 'notes') then c.value_number end as value_number,
      case when sh.visibility in ('result', 'notes') then c.value_time end as value_time,
      case when sh.visibility = 'notes' then c.tags else '{}'::text[] end as tags,
      case when sh.visibility = 'notes' then c.note end as note,
      c.updated_at
    from public.checkins c join shared sh on sh.id = c.habit_id
    where c.date > current_date - 400
  )
  select jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'invite_code', g.invite_code,
                                        'is_admin', public.is_group_admin(g.id))
              from public.groups g where g.id = gid),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', user_id, 'display_name', display_name, 'role', role, 'joined_at', joined_at,
        'today', today, 'last_checkin_date', last_checkin_date,
        'checked_in_today', case when due_today = 0 then null else done_today >= due_today end
      ) order by joined_at) from member_status), '[]'::jsonb),
    'habits', coalesce((select jsonb_agg(to_jsonb(sh)) from shared sh), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(to_jsonb(sc) order by sc.date desc) from shared_checkins sc), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- ---------- encouragement rate limits + push ----------------------------------
create function public.before_encouragement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'sos' and exists (
    select 1 from public.encouragements
    where from_user = new.from_user and group_id = new.group_id and kind = 'sos'
      and created_at > now() - interval '10 minutes'
  ) then
    raise exception 'You already asked this group for help a few minutes ago. They have been notified.';
  end if;
  if (select count(*) from public.encouragements
      where from_user = new.from_user and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'That''s a lot of messages in one hour. Please try again a bit later.';
  end if;
  return new;
end $$;

create trigger encouragement_limits before insert on public.encouragements
  for each row execute function public.before_encouragement();

-- Ask the Edge Function to notify the recipient(s).
create function public.after_encouragement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.call_push_function(jsonb_build_object('type', 'encouragement', 'id', new.id));
  return new;
end $$;

create trigger encouragement_push after insert on public.encouragements
  for each row execute function public.after_encouragement();

-- Helper functions are internal; only the app-facing functions are callable.
revoke all on function public.after_member_removed() from public, anon, authenticated;
revoke all on function public.before_encouragement() from public, anon, authenticated;
revoke all on function public.after_encouragement() from public, anon, authenticated;
revoke all on function public.new_invite_code() from public, anon, authenticated;

-- ---------- encouragement for me, for the Home screen --------------------------
create function public.recent_encouragements(p_limit int default 5)
returns table (id uuid, group_id uuid, group_name text, from_name text, kind text, message text, to_me boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.group_id, g.name, coalesce(p.display_name, 'Someone'), e.kind, e.message,
         coalesce(e.to_user = auth.uid(), false), e.created_at
  from public.encouragements e
  join public.groups g on g.id = e.group_id
  left join public.profiles p on p.id = e.from_user
  where public.is_group_member(e.group_id)
    and e.from_user <> auth.uid()
    and (e.to_user = auth.uid() or e.to_user is null)
    and e.created_at > now() - interval '7 days'
  order by e.created_at desc
  limit least(greatest(p_limit, 1), 20)
$$;
