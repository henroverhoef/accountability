-- Kudos: a "well done" on a good check-in (praying is for the harder ones).
alter table public.encouragements drop constraint if exists encouragements_kind_check;
alter table public.encouragements add constraint encouragements_kind_check
  check (kind in ('prayer', 'message', 'sos', 'kudos'));
