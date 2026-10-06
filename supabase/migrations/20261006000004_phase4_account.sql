-- =====================================================================
-- Steadfast – Phase 4: delete my account
-- Deleting the auth user removes EVERYTHING that belongs to them, because every
-- table references auth.users with "on delete cascade": profile, habits, check-ins,
-- sharing, group memberships, encouragements, devices and notification history.
-- Groups they created stay for the other members (created_by becomes empty).
-- =====================================================================

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
