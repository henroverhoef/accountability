-- Home screen list "From your groups": like recent_encouragements, plus which of my
-- check-ins a prayer or kudos was about (so the app can say "about 🛡️ Purity").
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
    and e.created_at > now() - interval '7 days'
  order by e.created_at desc
  limit least(greatest(p_limit, 1), 20)
$$;

revoke execute on function public.recent_for_me(int) from public, anon;
grant execute on function public.recent_for_me(int) to authenticated;
