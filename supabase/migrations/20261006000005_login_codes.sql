-- =====================================================================
-- Steadfast – simple sign-in
-- People join with just their name + a group code (Supabase "anonymous" accounts:
-- a real, private account per phone, without email or password).
-- To use the same account on another phone, they can create a personal LOGIN CODE.
-- Only a hash of the code is stored, in a table only the server can read.
-- =====================================================================

alter table public.profiles add column has_login_code boolean not null default false;

create table public.login_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now()
);
alter table public.login_codes enable row level security;
revoke all on public.login_codes from anon, authenticated;
