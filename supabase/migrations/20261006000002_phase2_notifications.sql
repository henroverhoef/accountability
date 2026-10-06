-- =====================================================================
-- Steadfast – Phase 2: push notifications and scheduled reminders
-- =====================================================================

-- ---------- notification preferences on the profile -------------------
alter table public.profiles
  add column quiet_start time,                 -- e.g. 22:30 (no reminders between start and end)
  add column quiet_end time,                   -- e.g. 06:00
  add column notify_reminders boolean not null default true,
  add column notify_encouragement boolean not null default true,
  add column notify_sos boolean not null default true,
  add column notify_weekly boolean not null default true;

-- ---------- one row per phone/browser that allowed notifications -------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,               -- {"p256dh": "...", "auth": "..."}
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: owner full access" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- If the same phone re-subscribes after switching accounts, hand the endpoint over.
create function public.save_push_subscription(p_endpoint text, p_keys jsonb, p_user_agent text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.push_subscriptions (user_id, endpoint, keys, user_agent)
  values (auth.uid(), p_endpoint, p_keys, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, keys = excluded.keys, user_agent = excluded.user_agent;
end $$;

-- ---------- what has been sent (prevents duplicates) --------------------
create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,    -- 'checkin', 'nudge', 'morning', 'habit:<id>', ...
  ref text not null,     -- usually the date it was about
  sent_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);

alter table public.notification_log enable row level security;
-- Users may see their own log; only the server (service role) writes to it.
create policy "notification_log: owner read" on public.notification_log
  for select using (user_id = auth.uid());

-- ---------- the scheduler -------------------------------------------------
-- pg_cron runs a job every 5 minutes; pg_net makes the web request to our Edge Function.
-- The function address and a shared secret are read from Supabase Vault, so no secret is
-- written in this file. See the README ("Scheduled reminders") for the two lines to run.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.call_push_function(payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  base_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
begin
  if base_url is null or secret is null then
    raise warning 'Steadfast: vault secrets project_url / cron_secret are not set yet';
    return;
  end if;
  perform net.http_post(
    url := base_url || '/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := payload,
    timeout_milliseconds := 20000
  );
end $$;

revoke all on function public.call_push_function(jsonb) from public, anon, authenticated;

select cron.schedule('steadfast-reminders', '*/5 * * * *', $$ select public.call_push_function('{"type":"tick"}'::jsonb) $$);

-- Keep the log small: forget entries older than 60 days, once a day.
select cron.schedule('steadfast-cleanup', '17 3 * * *', $$ delete from public.notification_log where sent_at < now() - interval '60 days' $$);
