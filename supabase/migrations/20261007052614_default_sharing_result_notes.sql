-- =====================================================================
-- Default sharing: a group sees "Result + notes" for every habit, unless the
-- person changes it (Group → Sharing tab, or on the habit's page).
--   * joining or starting a group shares all your current habits with it
--   * adding a habit shares it with all your groups
-- Choices someone already made are never overwritten ("on conflict do nothing").
-- =====================================================================

create function public.share_habits_with_new_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.habit_shares (habit_id, group_id, visibility)
  select h.id, new.group_id, 'notes'
  from public.habits h
  where h.user_id = new.user_id and not h.archived
  on conflict do nothing;
  return new;
end $$;

create trigger group_member_default_shares after insert on public.group_members
  for each row execute function public.share_habits_with_new_group();

create function public.share_new_habit_with_groups() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.archived then return new; end if;
  insert into public.habit_shares (habit_id, group_id, visibility)
  select new.id, m.group_id, 'notes'
  from public.group_members m
  where m.user_id = new.user_id
  on conflict do nothing;
  return new;
end $$;

create trigger habit_default_shares after insert on public.habits
  for each row execute function public.share_new_habit_with_groups();

revoke all on function public.share_habits_with_new_group() from public, anon, authenticated;
revoke all on function public.share_new_habit_with_groups() from public, anon, authenticated;
