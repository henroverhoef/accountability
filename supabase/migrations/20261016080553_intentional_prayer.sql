-- =====================================================================
-- Intentional prayer
-- * encouragements.topic: a prayer for the whole group about one habit they share
--   ("pray for this" on the group's Overview), e.g. 'No Short-form Video'.
-- * prayer_reminders: "I'll set aside time later". Private to the person who made it;
--   the push function reminds them at the chosen time.
-- =====================================================================

alter table public.encouragements add column if not exists topic text check (char_length(topic) <= 60);

create table if not exists public.prayer_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  who text not null check (char_length(who) between 1 and 80),   -- "Jesse" or "the group"
  what text check (char_length(what) <= 80),                       -- "Purity" (never in the notification)
  link text check (char_length(link) <= 200),                      -- screen to open afterwards
  remind_at timestamptz not null,
  sent_at timestamptz,
  prayed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists prayer_reminders_due_idx on public.prayer_reminders(remind_at) where sent_at is null;
create index if not exists prayer_reminders_user_idx on public.prayer_reminders(user_id);

alter table public.prayer_reminders enable row level security;

-- Only the owner sees or changes their reminders; the server (service role) sends them.
create policy "prayer_reminders: owner reads" on public.prayer_reminders
  for select using (user_id = auth.uid());
create policy "prayer_reminders: owner adds" on public.prayer_reminders
  for insert with check (
    user_id = auth.uid()
    and (group_id is null or public.is_group_member(group_id))
    and remind_at < now() + interval '2 days'
    and (select count(*) from public.prayer_reminders r where r.user_id = auth.uid() and r.created_at > now() - interval '1 day') < 30
  );
create policy "prayer_reminders: owner updates" on public.prayer_reminders
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "prayer_reminders: owner deletes" on public.prayer_reminders
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.prayer_reminders to authenticated;
revoke all on public.prayer_reminders from anon;
