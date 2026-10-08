-- =====================================================================
-- 1. Check-ins can be made for TODAY or LAST NIGHT only (was: up to 2 days back).
--    (+1 day of slack for phones whose clock/timezone is slightly off.)
-- 2. New habit type "scale": a score out of 10, e.g. "How thankful was I today?".
--    The score is stored in checkins.value_number; the question is habits.question.
-- 3. group_overview also returns the habit's question and when a check-in was first
--    saved (so the feed can say "caught up the next morning").
-- =====================================================================

-- 1. Today or last night
alter policy "checkins: owner insert" on public.checkins
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
    and date between public.user_today(auth.uid()) - 1 and public.user_today(auth.uid()) + 1
  );

alter policy "checkins: owner update" on public.checkins
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and date between public.user_today(auth.uid()) - 1 and public.user_today(auth.uid()) + 1
  );

-- 2. Score out of 10
alter table public.habits drop constraint habits_type_check;
alter table public.habits add constraint habits_type_check
  check (type in ('avoid', 'done', 'time', 'amount', 'scale'));
alter table public.habits add column if not exists question text check (char_length(question) <= 120);

-- 3. Group overview (same as before, plus habits.question and checkins.created_at)
create or replace function public.group_overview(gid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_group_member(gid) then raise exception 'not a member of this group'; end if;

  with members as (
    select m.user_id, m.role, m.joined_at, p.display_name, public.user_today(m.user_id) as today
    from public.group_members m join public.profiles p on p.id = m.user_id
    where m.group_id = gid
  ),
  member_status as (
    select mb.*,
      (select max(c.date) from public.checkins c where c.user_id = mb.user_id) as last_checkin_date,
      -- habits due today that are not yet checked in (count only; names stay private)
      (select count(*) from public.habits h
        where h.user_id = mb.user_id and not h.archived and h.start_date <= mb.today
          and extract(dow from mb.today)::int = any(h.schedule_days)) as due_today,
      (select count(*) from public.habits h join public.checkins c on c.habit_id = h.id and c.date = mb.today
        where h.user_id = mb.user_id and not h.archived and h.start_date <= mb.today
          and extract(dow from mb.today)::int = any(h.schedule_days)) as done_today
    from members mb
  ),
  shared as (
    select h.id, h.user_id, h.name, h.icon, h.type, h.schedule_days, h.start_date, h.outcome_options,
           h.unit, h.target_value, h.target_direction, h.target_time, h.question, s.visibility
    from public.habit_shares s join public.habits h on h.id = s.habit_id
    where s.group_id = gid and not h.archived and public.is_member_of(gid, h.user_id)
  ),
  shared_checkins as (
    select c.id, c.habit_id, c.user_id, c.date,
      case when sh.visibility in ('result', 'notes') then c.outcome end as outcome,
      case when sh.visibility in ('result', 'notes') then c.value_number end as value_number,
      case when sh.visibility in ('result', 'notes') then c.value_time end as value_time,
      case when sh.visibility = 'notes' then c.tags else '{}'::text[] end as tags,
      case when sh.visibility = 'notes' then c.note end as note,
      c.created_at, c.updated_at
    from public.checkins c join shared sh on sh.id = c.habit_id
    where c.date > current_date - 400
  )
  select jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'invite_code', g.invite_code,
                                        'is_admin', public.is_group_admin(g.id))
              from public.groups g where g.id = gid),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', user_id, 'display_name', display_name, 'role', role, 'joined_at', joined_at,
        'today', today, 'last_checkin_date', last_checkin_date,
        'checked_in_today', case when due_today = 0 then null else done_today >= due_today end
      ) order by joined_at) from member_status), '[]'::jsonb),
    'habits', coalesce((select jsonb_agg(to_jsonb(sh)) from shared sh), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(to_jsonb(sc) order by sc.date desc) from shared_checkins sc), '[]'::jsonb)
  ) into result;
  return result;
end $$;
