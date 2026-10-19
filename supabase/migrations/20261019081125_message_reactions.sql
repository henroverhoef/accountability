-- =====================================================================
-- Kudos and prayers on feed messages (and SOS).
-- A reaction is an encouragement (kind 'kudos' / 'prayer') with reply_to pointing at the
-- message, to_user = whoever wrote it. You can only react to a message you can see.
-- A word after praying for a message carries the same reply_to, so the feed can tag it,
-- and a prayer moment set aside for a message remembers it too.
-- =====================================================================

alter table public.encouragements add column if not exists reply_to uuid references public.encouragements(id) on delete cascade;
create index if not exists encouragements_reply_to_idx on public.encouragements(reply_to) where reply_to is not null;

alter table public.prayer_reminders add column if not exists reply_to uuid references public.encouragements(id) on delete set null;

-- Can the current user see this encouragement? (the same rule as "encouragements: members read")
create or replace function public.can_see_encouragement(eid uuid, gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.encouragements e
    where e.id = eid and e.group_id = gid and public.is_group_member(gid)
      and (e.kind <> 'message' or e.to_user is null or e.to_user = auth.uid() or e.from_user = auth.uid()))
$$;
revoke all on function public.can_see_encouragement(uuid, uuid) from public, anon;
grant execute on function public.can_see_encouragement(uuid, uuid) to authenticated;

alter policy "encouragements: members send" on public.encouragements with check (
  from_user = auth.uid()
  and public.is_group_member(group_id)
  and (to_user is null or (to_user <> auth.uid() and public.is_member_of(group_id, to_user)))
  and (checkin_id is null or public.checkin_shared_in_group(checkin_id, group_id, to_user))
  and (reply_to is null or public.can_see_encouragement(reply_to, group_id))
);
