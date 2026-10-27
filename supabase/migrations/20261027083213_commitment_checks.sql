-- =====================================================================
-- Commitment checks: "Let your yes be yes"
-- When a habit you committed to has been hard to keep, Home asks you about it honestly:
--   change  – the Lord has called me to this; something needs to change (+ what)
--   pray    – I'm not sure; I'll pray about it again
--   release – it isn't for this season (you then change or lay down the habit)
-- Your answers and notes are yours alone (the server reads them only to not ask again
-- too soon). If you want your group to back you, you share it in the feed yourself.
-- =====================================================================

create table if not exists public.commitment_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  answer text not null check (answer in ('change', 'pray', 'release')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists commitment_checks_user_idx on public.commitment_checks(user_id, created_at desc);

alter table public.commitment_checks enable row level security;

create policy "commitment_checks: owner reads" on public.commitment_checks
  for select using (user_id = auth.uid());
create policy "commitment_checks: owner adds" on public.commitment_checks
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
    and (select count(*) from public.commitment_checks c where c.user_id = auth.uid() and c.created_at > now() - interval '1 day') < 20
  );

grant select, insert on public.commitment_checks to authenticated;
revoke all on public.commitment_checks from anon;
