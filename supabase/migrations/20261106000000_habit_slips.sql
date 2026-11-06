-- =====================================================================
-- "I just gave in": slips on a habit you're breaking, logged as they happen
-- * habit_slips: each log (+1, +5, "I lost count") on one of your avoid habits.
--   Yours alone; the group never reads it directly.
-- * The group sees ONE feed card per person, habit and day ("📵 Short-form video:
--   7 videos"), made by the first slip and updated by the next ones. Only for a habit
--   shared with that group with its result (Result or Result + notes), and only while it
--   still is. A new card notifies the group once ("John shared something in the feed");
--   updating it doesn't.
-- * habits.slip_yellow_max: how many slips a day are still yellow. 0 (the default)
--   means any slip is red: it's a habit you don't want in your life.
-- =====================================================================

alter table public.habits add column if not exists slip_yellow_max int not null default 0
  check (slip_yellow_max between 0 and 1000);

create table if not exists public.habit_slips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  date date not null,                                  -- your own date when it happened
  amount int check (amount between 1 and 1000),       -- null when you lost count
  lost_count boolean not null default false,
  created_at timestamptz not null default now(),
  check ((lost_count and amount is null) or (not lost_count and amount is not null))
);
create index if not exists habit_slips_habit_date_idx on public.habit_slips(habit_id, date);
create index if not exists habit_slips_user_idx on public.habit_slips(user_id, created_at desc);

alter table public.habit_slips enable row level security;

create policy "habit_slips: owner reads" on public.habit_slips
  for select using (user_id = auth.uid());
create policy "habit_slips: owner logs" on public.habit_slips
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid() and h.type = 'avoid' and not h.archived)
    and date between public.user_today(auth.uid()) - 1 and public.user_today(auth.uid())
    and (select count(*) from public.habit_slips s where s.user_id = auth.uid() and s.created_at > now() - interval '1 day') < 200
  );
-- Undo a mis-tap (today or last night only).
create policy "habit_slips: owner undoes" on public.habit_slips
  for delete using (user_id = auth.uid() and date >= public.user_today(auth.uid()) - 1);

grant select, insert, delete on public.habit_slips to authenticated;
revoke all on public.habit_slips from anon;

-- ---------- the feed card ------------------------------------------------------
alter table public.encouragements add column if not exists habit_id uuid references public.habits(id) on delete cascade;
alter table public.encouragements add column if not exists slip_date date;
alter table public.encouragements add column if not exists updated_at timestamptz;

alter table public.encouragements drop constraint if exists encouragements_kind_check;
alter table public.encouragements add constraint encouragements_kind_check
  check (kind in ('prayer', 'message', 'sos', 'kudos', 'heart', 'slip'));
alter table public.encouragements add constraint encouragements_slip_check
  check (kind <> 'slip' or (habit_id is not null and slip_date is not null and to_user is null));
create unique index if not exists encouragements_slip_card_idx
  on public.encouragements(from_user, group_id, habit_id, slip_date) where kind = 'slip';

-- Is this habit shared with this group with its result? (habit_shares is owner-only.)
create or replace function public.slip_visible(hid uuid, gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.habit_shares s where s.habit_id = hid and s.group_id = gid and s.visibility in ('result', 'notes'))
$$;
revoke all on function public.slip_visible(uuid, uuid) from public, anon;
grant execute on function public.slip_visible(uuid, uuid) to authenticated;

alter policy "encouragements: members read" on public.encouragements using (
  public.is_group_member(group_id)
  and (kind <> 'message' or to_user is null or group_sees or to_user = auth.uid() or from_user = auth.uid())
  and (kind <> 'slip' or from_user = auth.uid() or public.slip_visible(habit_id, group_id))
);

-- Can the current user see this encouragement? (the same rule as "encouragements: members read")
create or replace function public.can_see_encouragement(eid uuid, gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.encouragements e
    where e.id = eid and e.group_id = gid and public.is_group_member(gid)
      and (e.kind <> 'message' or e.to_user is null or e.group_sees or e.to_user = auth.uid() or e.from_user = auth.uid())
      and (e.kind <> 'slip' or e.from_user = auth.uid() or public.slip_visible(e.habit_id, gid)))
$$;

-- Cards only ever come from your slips (the trigger below), never straight from the app.
alter policy "encouragements: members send" on public.encouragements with check (
  from_user = auth.uid()
  and public.is_group_member(group_id)
  and kind <> 'slip'
  and (to_user is null or (to_user <> auth.uid() and public.is_member_of(group_id, to_user)))
  and (checkin_id is null or public.checkin_shared_in_group(checkin_id, group_id, to_user))
  and (reply_to is null or public.can_see_encouragement(reply_to, group_id))
);

-- The hourly message limit doesn't apply to cards (they follow your slips, at most one a day).
create or replace function public.before_encouragement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'slip' then return new; end if;
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

-- After a slip is logged or undone: make or update the day's card in each group that sees
-- this habit's results. Its text is "📵 Short-form video: 7 videos" (or ": lost count");
-- no message left (everything undone) hides it.
create or replace function public.after_slip() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.habit_slips;
  h public.habits;
  total int;
  lost boolean;
  card text;
begin
  if tg_op = 'INSERT' then s := new; else s := old; end if;
  select * into h from public.habits where id = s.habit_id;
  if not found then return null; end if; -- the habit itself is being removed
  select coalesce(sum(amount), 0), coalesce(bool_or(lost_count), false) into total, lost
    from public.habit_slips where habit_id = s.habit_id and date = s.date;
  card := case when total = 0 and not lost then null
    else h.icon || ' ' || h.name || ': ' || case when lost then 'lost count'
      else total || ' ' || coalesce(nullif(trim(h.unit), ''), case when total = 1 then 'time' else 'times' end) end end;
  if tg_op = 'INSERT' then
    insert into public.encouragements (group_id, from_user, kind, habit_id, slip_date, message, updated_at)
    select sh.group_id, s.user_id, 'slip', s.habit_id, s.date, card, now()
    from public.habit_shares sh
    join public.group_members m on m.group_id = sh.group_id and m.user_id = s.user_id
    where sh.habit_id = s.habit_id and sh.visibility in ('result', 'notes')
    on conflict (from_user, group_id, habit_id, slip_date) where kind = 'slip'
    do update set message = excluded.message, updated_at = excluded.updated_at;
  else
    update public.encouragements set message = card, updated_at = now()
    where kind = 'slip' and from_user = s.user_id and habit_id = s.habit_id and slip_date = s.date;
  end if;
  return null;
end $$;

create trigger habit_slips_feed after insert or delete on public.habit_slips
  for each row execute function public.after_slip();
revoke all on function public.after_slip() from public, anon, authenticated;
revoke all on function public.before_encouragement() from public, anon, authenticated;

-- Home's "From your groups" leaves hearts and slip cards out: they show in the feed (and
-- versions of the app from before them don't know them).
create or replace function public.recent_for_me(p_limit int default 5)
returns table (id uuid, group_id uuid, group_name text, from_name text, kind text, message text,
               to_me boolean, checkin_id uuid, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.group_id, g.name, coalesce(p.display_name, 'Someone'), e.kind, e.message,
         coalesce(e.to_user = auth.uid(), false),
         case when e.to_user = auth.uid() then e.checkin_id end,
         e.created_at
  from public.encouragements e
  join public.groups g on g.id = e.group_id
  left join public.profiles p on p.id = e.from_user
  where public.is_group_member(e.group_id)
    and e.from_user <> auth.uid()
    and (e.to_user = auth.uid() or e.to_user is null)
    and e.kind not in ('heart', 'slip')
    and e.created_at > now() - interval '7 days'
  order by e.created_at desc
  limit least(greatest(p_limit, 1), 20)
$$;

revoke execute on function public.recent_for_me(int) from public, anon;
grant execute on function public.recent_for_me(int) to authenticated;
