-- =====================================================================
-- "I've reached out" on a cry for help (SOS) in the group feed
-- So the group can see who has already called or messaged the person, and nobody
-- assumes someone else did. Everyone in the group sees it EXCEPT the person who sent
-- the SOS (enforced here). One per person per SOS; tap again to undo.
-- =====================================================================

create table if not exists public.sos_responses (
  id uuid primary key default gen_random_uuid(),
  sos_id uuid not null references public.encouragements(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  from_user uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (sos_id, from_user)
);
create index if not exists sos_responses_group_idx on public.sos_responses(group_id, created_at desc);

alter table public.sos_responses enable row level security;

-- The group sees them, never the person who asked for help (who can see their own SOS,
-- so the check below excludes them).
create policy "sos_responses: group reads, never the sender" on public.sos_responses
  for select using (
    public.is_group_member(group_id)
    and not exists (select 1 from public.encouragements e where e.id = sos_id and e.from_user = auth.uid())
  );
create policy "sos_responses: members add" on public.sos_responses
  for insert with check (
    from_user = auth.uid()
    and public.is_group_member(group_id)
    and exists (select 1 from public.encouragements e
                where e.id = sos_id and e.group_id = sos_responses.group_id and e.kind = 'sos' and e.from_user <> auth.uid())
  );
-- Undo a mis-tap.
create policy "sos_responses: undo your own" on public.sos_responses
  for delete using (from_user = auth.uid());

grant select, insert, delete on public.sos_responses to authenticated;
revoke all on public.sos_responses from anon;
