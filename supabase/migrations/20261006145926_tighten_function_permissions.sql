-- Everyone using the app is signed in (anonymous accounts use the "authenticated" role),
-- so nothing needs to be callable by visitors who haven't joined ("anon").
revoke execute on function
  public.checkin_shared_in_group(uuid, uuid, uuid),
  public.create_group(text),
  public.delete_my_account(),
  public.group_overview(uuid),
  public.is_group_admin(uuid),
  public.is_group_member(uuid),
  public.is_member_of(uuid, uuid),
  public.join_group(text),
  public.recent_encouragements(integer),
  public.regenerate_invite_code(uuid),
  public.save_push_subscription(text, jsonb, text),
  public.user_today(uuid)
from public, anon;

grant execute on function
  public.checkin_shared_in_group(uuid, uuid, uuid),
  public.create_group(text),
  public.delete_my_account(),
  public.group_overview(uuid),
  public.is_group_admin(uuid),
  public.is_group_member(uuid),
  public.is_member_of(uuid, uuid),
  public.join_group(text),
  public.recent_encouragements(integer),
  public.regenerate_invite_code(uuid),
  public.save_push_subscription(text, jsonb, text),
  public.user_today(uuid)
to authenticated;

-- Trigger-only function: never called directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Fixed search_path (Supabase security recommendation).
alter function public.touch_updated_at() set search_path = public;
alter function public.new_invite_code() set search_path = public;
