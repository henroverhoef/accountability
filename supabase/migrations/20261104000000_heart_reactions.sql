-- =====================================================================
-- ❤️ on a feed message: "love this", next to 👏 kudos and 🙏 prayer.
-- Like kudos on a message it's an encouragement with reply_to (the message) and
-- to_user (its author); the same insert policy applies (only messages you can see).
-- =====================================================================

alter table public.encouragements drop constraint if exists encouragements_kind_check;
alter table public.encouragements add constraint encouragements_kind_check
  check (kind in ('prayer', 'message', 'sos', 'kudos', 'heart'));
alter table public.encouragements add constraint encouragements_heart_check
  check (kind <> 'heart' or (reply_to is not null and to_user is not null));

-- Home's "From your groups" leaves hearts out: they show on the message itself (and
-- versions of the app from before hearts don't know them).
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
    and e.kind <> 'heart'
    and e.created_at > now() - interval '7 days'
  order by e.created_at desc
  limit least(greatest(p_limit, 1), 20)
$$;

revoke execute on function public.recent_for_me(int) from public, anon;
grant execute on function public.recent_for_me(int) to authenticated;
