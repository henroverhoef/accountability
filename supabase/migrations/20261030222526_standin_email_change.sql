-- =====================================================================
-- Adding a real email to an account from the login-code days
-- Those accounts have a stand-in address (…@login.steadfast.invalid) that can never
-- receive email. With Supabase's "Secure email change" on, changing the address also
-- needs a confirmation from the OLD address, so the change could never finish.
-- After asking for the change, the app calls this to mark the old side as done: the
-- link sent to the new address is then enough. Only for your own account, only while a
-- change away from a stand-in address is waiting.
-- =====================================================================

create or replace function public.skip_standin_confirmation() returns void
language sql security definer set search_path = '' as $$
  update auth.users
  set email_change_token_current = '', email_change_confirm_status = 1
  where id = auth.uid()
    and email like '%@login.steadfast.invalid'
    and coalesce(email_change, '') <> ''
    and coalesce(email_change_token_current, '') <> ''
$$;

revoke all on function public.skip_standin_confirmation() from public, anon;
grant execute on function public.skip_standin_confirmation() to authenticated;
