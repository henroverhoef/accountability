-- Restoring an archived habit is a fresh start: it counts again from the day it's restored,
-- so the days it was archived aren't read as missed check-ins (streaks, the support and
-- commitment checks, the calendar). Its check-ins from before stay.
create or replace function public.habit_restored() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.archived and not new.archived then
    new.start_date := greatest(old.start_date, public.user_today(new.user_id));
  end if;
  return new;
end $$;

create trigger habit_restored before update of archived on public.habits
  for each row execute function public.habit_restored();
revoke all on function public.habit_restored() from public, anon, authenticated;
