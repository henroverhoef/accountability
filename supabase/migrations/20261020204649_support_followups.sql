-- =====================================================================
-- Follow-ups: "I've called Jesse" / "I've had coffee with Jesse"
-- When someone is going through a hard stretch or has gone quiet, the group can
-- note that they followed up, so they can see whether someone has. Several people
-- can each note a call or a coffee.
-- The person it's about NEVER sees these (enforced here, not just in the app).
-- =====================================================================

create table if not exists public.support_followups (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  about_user uuid not null references auth.users(id) on delete cascade,
  from_user uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('call', 'coffee')),
  created_at timestamptz not null default now()
);
create index if not exists support_followups_group_idx on public.support_followups(group_id, created_at desc);

alter table public.support_followups enable row level security;

create policy "support_followups: group reads, never the person" on public.support_followups
  for select using (public.is_group_member(group_id) and about_user <> auth.uid());
create policy "support_followups: members add" on public.support_followups
  for insert with check (
    from_user = auth.uid()
    and about_user <> auth.uid()
    and public.is_group_member(group_id)
    and public.is_member_of(group_id, about_user)
    and (select count(*) from public.support_followups f where f.from_user = auth.uid() and f.created_at > now() - interval '1 day') < 30
  );
-- Undo a mis-tap.
create policy "support_followups: undo your own" on public.support_followups
  for delete using (from_user = auth.uid());

grant select, insert, delete on public.support_followups to authenticated;
revoke all on public.support_followups from anon;
