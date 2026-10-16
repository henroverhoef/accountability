-- =====================================================================
-- Inactive accounts and groups are removed after 30 days.
--
-- "Active" = the latest of: account created, app opened (profiles.last_seen_at, set by
-- the app), signed in, a check-in saved, or a prayer/kudos/message sent.
-- * Every night: accounts inactive for 30+ days are deleted (with everything they own,
--   as with "Delete my account"), and groups where nobody has been active for 30 days
--   are deleted. A group also disappears when its last member is removed.
-- * At 23 days the push function warns people with notifications on.
-- * The app owner (app_admins) is never removed automatically.
-- * The app owner can also remove an account by hand from the App overview.
-- (account_activity() comes from the previous migration.)
-- =====================================================================

create or replace function public.cleanup_inactive(p_days int default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cutoff timestamptz := now() - make_interval(days => p_days);
  accounts int;
  groups_gone int;
begin
  with gone as (
    delete from auth.users u
    using public.account_activity() a
    where a.user_id = u.id and a.last_active < cutoff
      and not exists (select 1 from public.app_admins ad where ad.user_id = u.id)
    returning u.id
  ) select count(*) into accounts from gone;

  with gone as (
    delete from public.groups g
    where g.created_at < cutoff
      and not exists (
        select 1 from public.group_members m join public.account_activity() a on a.user_id = m.user_id
        where m.group_id = g.id and a.last_active >= cutoff)
    returning g.id
  ) select count(*) into groups_gone from gone;

  return jsonb_build_object('accounts', accounts, 'groups', groups_gone);
end $$;

-- App owner: remove one account by hand (App overview → Remove).
create or replace function public.admin_delete_account(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'Use Settings → Delete my account for your own account'; end if;
  delete from auth.users where id = p_user;
end $$;

revoke all on function public.cleanup_inactive(int) from public, anon, authenticated;
revoke all on function public.admin_delete_account(uuid) from public, anon;
grant execute on function public.admin_delete_account(uuid) to authenticated;

-- Every night at 03:37 UTC.
select cron.schedule('steadfast-inactive-cleanup', '37 3 * * *', $$ select public.cleanup_inactive(30) $$);
