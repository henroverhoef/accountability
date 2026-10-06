# Steadfast

A small, private app for daily habits and Christian accountability among friends.
Build good habits (quiet time, bedtime, exercise), break bad ones, check in honestly
every day, and encourage each other in small groups.

It's a **Progressive Web App (PWA)**: a website that installs to the home screen like an
app, works offline and can send notifications. It's hosted free on **GitHub Pages**, with
data in a free **Supabase** project.

---

## Contents

1. [How it fits together](#how-it-fits-together)
2. [One-time setup](#one-time-setup)
   1. [Create the Supabase project](#1-create-the-supabase-project)
   2. [Create the database tables (migrations)](#2-create-the-database-tables-migrations)
   3. [Set up sign-in emails](#3-set-up-sign-in-emails)
   4. [Put the keys in GitHub and turn on Pages](#4-put-the-keys-in-github-and-turn-on-pages)
   5. [Notifications and scheduled reminders](#5-notifications-and-scheduled-reminders)
3. [Installing the app on a phone](#installing-the-app-on-a-phone)
4. [Working on the code](#working-on-the-code)
5. [Project layout](#project-layout)
6. [Privacy & security notes](#privacy--security-notes)

---

## How it fits together

```
 Phone (installed PWA)  ──►  GitHub Pages (the app's files)
          │
          └──────────────►  Supabase
                              • Auth (email sign-in code)
                              • Postgres database (Row Level Security on every table)
                              • pg_cron: every 5 min ──► Edge Function "push"
                                                          └──► Web Push ──► phones
```

- The app is in `src/` (React + TypeScript + Tailwind, built with Vite).
- The database is described by SQL files in `supabase/migrations/`.
- Rules shared by the app and the server (dates, streaks, …) are in
  `supabase/functions/_shared/logic/`.

---

## One-time setup

You need a free GitHub account (you have one) and a free Supabase account.

### 1. Create the Supabase project

1. Go to <https://supabase.com>, sign in and click **New project**.
2. Pick a name (e.g. `steadfast`), a strong database password (save it in your password
   manager) and a region close to you (e.g. *South Africa (Cape Town)* if available,
   otherwise *West EU*).
3. When it's ready, open **Project Settings → API** (or **Connect**) and note:
   - **Project URL**: looks like `https://abcdefgh.supabase.co`
   - **anon / public key** (also called the *publishable* key): a long string.
     This key is safe to put in the app, because Row Level Security protects the data.
   - Never put the **service_role / secret** key anywhere in this repo.

### 2. Create the database tables (migrations)

Easiest way (no tools to install):

1. In Supabase open **SQL Editor → New query**.
2. Open each file in `supabase/migrations/` **in order of their names** (oldest first),
   copy the whole file, paste, and click **Run**. You should see "Success".

Alternative with the Supabase CLI (if you have it installed):

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF   # the "abcdefgh" part of the URL
npx supabase db push                                 # applies every migration
```

When new migration files are added later, run just the new ones (or `db push` again).

### 3. Set up sign-in emails

People sign in with a code sent by email. (On iPhone the installed app can't receive
"magic links", because links open in Safari, so a **code** is important.)

1. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://henroverhoef.github.io/accountability/`
   - **Redirect URLs**: add the same URL, and `http://localhost:5173/accountability/` for
     local testing.
2. Supabase → **Authentication → Emails → Templates → Magic Link** (and do the same for
   **Confirm signup**). Replace the body with something like:

   ```html
   <h2>Your Steadfast sign-in code</h2>
   <p>Enter this code in the app:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>Or <a href="{{ .ConfirmationURL }}">tap here to sign in</a> in this browser.</p>
   ```

3. Supabase's built-in email sender only allows a few emails per hour. That's fine for
   testing, but for a whole church group set up a free SMTP provider (e.g. Resend or
   Brevo) under **Authentication → Emails → SMTP Settings**.

### 4. Put the keys in GitHub and turn on Pages

1. In your GitHub repo go to **Settings → Secrets and variables → Actions → New
   repository secret** and add:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon / publishable key |

2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to the `main` branch (or open **Actions → Deploy to GitHub Pages → Run
   workflow**). After about 1–2 minutes the app is live at
   `https://henroverhoef.github.io/accountability/`.

> If you rename the repository, the web address changes too. The workflow picks up the
> new name automatically, but update the Supabase Site URL / Redirect URLs.

### 5. Notifications and scheduled reminders

Notifications use standard **Web Push**. You need a key pair (called *VAPID keys*): the
public half goes into the app, the private half only into Supabase.

**a) Generate the keys** (on any computer with Node.js):

```bash
npx web-push generate-vapid-keys
```

It prints a *Public Key* and a *Private Key*. Also make up a long random password for
the scheduler (the *cron secret*), e.g. with `openssl rand -hex 32`, or just mash the
keyboard for 40+ characters.

**b) Give the private values to Supabase** (Dashboard → **Edge Functions → Secrets**,
or with the CLI):

```bash
npx supabase secrets set \
  VAPID_PUBLIC_KEY="<public key>" \
  VAPID_PRIVATE_KEY="<private key>" \
  VAPID_SUBJECT="mailto:<your email>" \
  CRON_SECRET="<your cron secret>"
```

**c) Deploy the Edge Function** (needs the Supabase CLI, linked as in step 2):

```bash
npx supabase functions deploy push --use-api
```

`supabase/config.toml` already tells Supabase not to require a login token for this
function; it checks the cron secret or the user's token itself.

**d) Tell the scheduler where to call.** The Phase 2 migration already switched on
`pg_cron` and `pg_net` and created a job that runs every 5 minutes. It reads two values
from Supabase **Vault** (encrypted storage). Run this once in the SQL Editor:

```sql
select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
select vault.create_secret('<your cron secret>', 'cron_secret');
```

(If the migration complained about extensions, enable **pg_cron** and **pg_net** under
Database → Extensions and run the migration again.)

**e) Give the public key to the app:** add a GitHub secret `VITE_VAPID_PUBLIC_KEY` with
the *public* key (Settings → Secrets and variables → Actions), then re-run the deploy.

**Checking it works**

- In the app: Settings → **Turn on notifications** → **Send test**.
- Supabase → **Integrations → Cron** (or Database → Cron Jobs) shows
  `steadfast-reminders` running every 5 minutes.
- Supabase → **Edge Functions → push → Logs** shows each run, e.g. `{"users":3,"sent":1}`.
- SQL: `select * from net._http_response order by created desc limit 5;` shows the
  scheduler's calls (status 200 is good, 403 means the cron secrets don't match).

**How reminders work**

- Every 5 minutes the server checks each person's reminder times *in their own
  timezone*. A reminder is sent during the 30 minutes after its time, but only once
  (recorded in `notification_log`), and only if you haven't already checked in.
- Daily check-in reminder (default 21:30), a nudge if you still haven't (default 1 hour
  later), and a morning nudge about yesterday (default 07:30).
- Per-habit reminders and a "wind-down" reminder before a bedtime target are set when
  editing a habit.
- Quiet hours stop reminders during that period.
- Phones that uninstall the app are cleaned up automatically (the push service answers
  "gone").

---

## Installing the app on a phone

**Android (Chrome)**
1. Open `https://henroverhoef.github.io/accountability/` in Chrome.
2. Tap the **⋮** menu → **Add to Home screen** (or **Install app**) → **Install**.

**iPhone (Safari, iOS 16.4 or newer)**
1. Open the address in **Safari** (not Chrome; iOS only installs web apps from Safari).
2. Tap the **Share** button (square with an arrow) → **Add to Home Screen** → **Add**.
3. Open Steadfast **from the home screen icon**. Notifications only work when it's opened
   this way.
4. In the app go to **Settings → Turn on notifications** and tap **Allow**.

On Android, after installing, also go to Settings → Turn on notifications → Allow.

---

## Working on the code

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
cp .env.example .env.local      # then fill in your Supabase URL and anon key
npm run dev                     # opens http://localhost:5173/accountability/
npm test                        # runs the automated tests
npm run build                   # type-checks and builds into dist/
```

---

## Project layout

```
src/
  App.tsx                 routes (which screen shows for which #/address)
  sw.ts                   service worker: offline cache + showing notifications
  lib/push.ts             turning notifications on/off, test notification
  data/DataProvider.tsx   loads/saves your profile, habits and check-ins
  pages/                  one file per screen
  components/             reusable pieces (check-in card, heatmap, …)
  lib/                    templates, Bible verses, labels, Supabase client
supabase/
  migrations/             database tables + security rules (run in order)
  functions/push/         Edge Function that sends every notification
  functions/_shared/      server helpers; logic/ = pure rules shared with the app
                          (dates, streaks, reminder timing, web push encryption)
tests/                    automated tests (npm test)
.github/workflows/        automatic deploy to GitHub Pages
```

Common changes:

- **Add a Bible verse**: `src/lib/verses.ts`
- **Change habit templates**: `src/lib/templates.ts`
- **Change colours / button styles**: `src/index.css`

---

## Privacy & security notes

- Every table has **Row Level Security**: the database itself refuses to show one
  person's data to another unless a rule explicitly allows it.
- Check-ins can only be written for today and the previous two days.
- Notification text never mentions what a habit is about. Reminders for "avoid" habits
  never include the habit's name.
- The VAPID private key and cron secret live only in Supabase secrets / Vault.
- Secrets never go in this repo. The only values in the built app are the Supabase URL and
  the public anon key, which are designed to be public.
