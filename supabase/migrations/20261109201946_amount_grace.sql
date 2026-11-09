-- Amount habits get an optional grace, like time targets: within it of the target is
-- yellow ("at least 3 chapters", grace 1: 2 chapters is yellow), further off red.
-- 0 (the default) means no yellow: the target is met or it isn't.
alter table public.habits add column if not exists amount_grace numeric not null default 0
  check (amount_grace >= 0);
