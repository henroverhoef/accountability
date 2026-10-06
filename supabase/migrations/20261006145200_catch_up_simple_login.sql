-- Catch-up for the live project, which had an earlier version of the Phase 2 file applied.
-- Everything here is "if not exists" / "create or replace", so on a fresh project
-- (where files 1–5 already did all of this) it changes nothing.

create table if not exists public.app_secrets (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

create or replace function public.call_push_function(payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  fn_url text := (select value from public.app_secrets where name = 'push_url');
  secret text := (select value from public.app_secrets where name = 'cron_secret');
begin
  if fn_url is null or secret is null then
    return; -- the push function hasn't run yet; nothing to do
  end if;
  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := payload,
    timeout_milliseconds := 20000
  );
end $$;
revoke all on function public.call_push_function(jsonb) from public, anon, authenticated;

alter table public.profiles add column if not exists has_login_code boolean not null default false;

create table if not exists public.login_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now()
);
alter table public.login_codes enable row level security;
revoke all on public.login_codes from anon, authenticated;
