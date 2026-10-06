-- =====================================================================
-- Steadfast – Phase 1: profiles, habits, check-ins
-- Every table has Row Level Security (RLS) switched on.
-- With RLS on and no matching policy, NOTHING is readable or writable.
-- =====================================================================

-- ---------- profiles --------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  timezone text not null default 'Africa/Johannesburg',
  checkin_reminder_time time not null default '21:30',
  nudge_enabled boolean not null default true,
  nudge_delay_minutes int not null default 60 check (nudge_delay_minutes between 15 and 240),
  morning_nudge_time time not null default '07:30',
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Create a profile automatically when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- "Today" for a user, in their own timezone.
create function public.user_today(uid uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce(
    (select timezone from public.profiles where id = uid), 'Africa/Johannesburg'))::date
$$;

-- ---------- habits ----------------------------------------------------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  icon text not null default '✅',
  type text not null check (type in ('avoid', 'done', 'time', 'amount')),
  schedule_days int[] not null default '{0,1,2,3,4,5,6}',  -- 0 = Sunday
  start_date date not null default current_date,
  target_value numeric,
  target_direction text check (target_direction in ('at_least', 'at_most')),
  target_time time,
  grace_minutes int not null default 0,
  unit text,
  -- Display labels for the three outcomes: {"good": "Clean", "mid": "Struggled", "bad": "Slipped"}
  outcome_options jsonb not null default '{}'::jsonb,
  -- Quick tags, e.g. ["late night", "alone", "stressed"]
  tags jsonb not null default '[]'::jsonb,
  reminder_time time,
  wind_down_minutes int,
  archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index habits_user_idx on public.habits(user_id);
alter table public.habits enable row level security;

create policy "habits: owner full access" on public.habits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- checkins --------------------------------------------------
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  outcome text not null check (outcome in ('good', 'mid', 'bad')),
  value_number numeric,
  value_time time,
  tags text[] not null default '{}',
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, date)
);

create index checkins_user_date_idx on public.checkins(user_id, date);
alter table public.checkins enable row level security;

create policy "checkins: owner read" on public.checkins
  for select using (user_id = auth.uid());
create policy "checkins: owner delete" on public.checkins
  for delete using (user_id = auth.uid());

-- Writing is only allowed for your own habits, and only for today or up to 2 days back
-- (+1 day of slack for phones whose clock/timezone is slightly off).
create policy "checkins: owner insert" on public.checkins
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
    and date between public.user_today(auth.uid()) - 2 and public.user_today(auth.uid()) + 1
  );
create policy "checkins: owner update" on public.checkins
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and date between public.user_today(auth.uid()) - 2 and public.user_today(auth.uid()) + 1
  );

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger checkins_touch before update on public.checkins
  for each row execute function public.touch_updated_at();
