-- Remembers that someone has seen the one-time "Quick tip" (install + notifications).
alter table public.profiles add column if not exists quick_tip_seen boolean not null default false;
