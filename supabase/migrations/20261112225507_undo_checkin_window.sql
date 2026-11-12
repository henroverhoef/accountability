-- Undoing a check-in ("I checked in on the wrong day") is only for today or last night,
-- the same days you can change one: older history stays as it was. (Deleting a habit or
-- your account still removes its check-ins: those go through the database, not this rule.)
alter policy "checkins: owner delete" on public.checkins
  using (
    user_id = auth.uid()
    and date between public.user_today(auth.uid()) - 1 and public.user_today(auth.uid()) + 1
  );
