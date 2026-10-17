-- =====================================================================
-- A word after praying: what you felt, sensed or want to encourage them with.
-- It's a personal message (kind 'message', so only sender and recipient see it; to the
-- whole group for a group prayer), marked from_prayer and linked to the check-in or
-- shared habit (topic) the prayer was about, so the feed can tag it.
-- Prayer reminders remember who/what they're for, so the planned moment can send it too.
-- =====================================================================

alter table public.encouragements add column if not exists from_prayer boolean not null default false;

-- Room for a verse and a few sentences.
alter table public.encouragements drop constraint if exists encouragements_message_check;
alter table public.encouragements add constraint encouragements_message_check check (char_length(message) <= 1000);

alter table public.prayer_reminders
  add column if not exists to_user uuid references auth.users(id) on delete cascade,
  add column if not exists checkin_id uuid references public.checkins(id) on delete set null,
  add column if not exists topic text check (char_length(topic) <= 60);
