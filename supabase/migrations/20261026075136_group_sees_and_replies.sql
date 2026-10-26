-- =====================================================================
-- Personal messages the group may see, and replies
-- * encouragements.group_sees: a message to one person (to_user) that the sender chose
--   to show to the whole group too ("good to encourage within community"). Off by
--   default: a personal message stays between the two of them.
-- * Replies ("I really needed this") are messages with reply_to set: nothing new is
--   needed for them here.
-- =====================================================================

alter table public.encouragements add column if not exists group_sees boolean not null default false;
alter table public.encouragements add constraint encouragements_group_sees_check check (not group_sees or to_user is not null);

-- Private messages stay visible only to sender and recipient, unless the sender let the group see it.
alter policy "encouragements: members read" on public.encouragements using (
  public.is_group_member(group_id)
  and (kind <> 'message' or to_user is null or group_sees or to_user = auth.uid() or from_user = auth.uid())
);

-- Can the current user see this encouragement? (the same rule as "encouragements: members read")
create or replace function public.can_see_encouragement(eid uuid, gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.encouragements e
    where e.id = eid and e.group_id = gid and public.is_group_member(gid)
      and (e.kind <> 'message' or e.to_user is null or e.group_sees or e.to_user = auth.uid() or e.from_user = auth.uid()))
$$;
