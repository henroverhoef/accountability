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
   6. [Groups](#6-groups)
3. [Installing the app on a phone](#installing-the-app-on-a-phone)
4. [Testing on your phone (checklist)](#testing-on-your-phone-checklist)
5. [Other features](#other-features)
6. [Working on the code](#working-on-the-code)
7. [Project layout](#project-layout)
8. [Privacy & security notes](#privacy--security-notes)

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

### 6. Groups

Nothing extra to set up: run the Phase 3 migration (and redeploy the `push` function,
which now also sends prayer / encouragement / SOS notifications):

```bash
npx supabase functions deploy push --use-api
```

How groups work:

- Anyone can **start a group** (they become its admin) and share the **invite code** or
  link. Others join with the code. People can be in several groups.
- The admin can rename the group, make a new code (the old one stops working) and remove
  members. If the admin leaves, the longest-standing member becomes admin.
- **Sharing is per habit, per group** (Group → *Sharing* tab, or on a habit's page):
  Private (default) · Check-in only · Result · Result + notes.
- Everyone in a group sees whether each member has done today's check-in. Members who
  haven't checked in for 3+ days are highlighted so others can reach out.
- **🙏 Praying for you** and short messages (max 280 characters) send a notification. A
  message to one person is only visible to the two of you.
- **🆘 I need help** (Home screen) notifies chosen groups immediately, even during their
  quiet hours, then shows a calming screen. To prevent accidents it can be sent to the
  same group at most once every 10 minutes.

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

## Testing on your phone (checklist)

After each setup step, the app updates automatically (close and reopen it; on iPhone
you may need to close it from the app switcher twice to get the newest version).

**Phase 1: solo use**
1. Open the site on your phone, install it (see above), open it from the icon.
2. Sign in with your email → enter the code from the email.
3. Enter your name, pick 2–3 habits, finish onboarding.
4. Tap **Check in**, answer each habit, **Save**. Try *Slipped* on Purity: you should see a
   verse. Check **Yesterday** too.
5. Habits → tap a habit → see the heatmap; tap a square to see that day. Edit a habit,
   rename it, add a tag.
6. Turn on airplane mode and reopen the app: it should still open.

**Phase 2: notifications** (after step 5 of the setup)
1. Settings → **Turn on notifications** → Allow → **Send test**. A notification should
   arrive within seconds. Tap it: the app opens.
2. Set **Evening check-in reminder** to ~10 minutes from now, don't check in, and lock
   the phone. The reminder arrives within 5 minutes of that time (the scheduler runs
   every 5 minutes). With *Nudge* on, another one comes after the delay you chose.
3. Edit Bedtime → wind-down 30 min, set its target ~35 min from now → reminder arrives.
4. Check in, then set the reminder a few minutes ahead again: no reminder (already done).

**Phase 3: groups** (best with a second phone or a friend)
1. Groups → **Start a group** → Invite tab → **Share invite link** to a friend.
2. Friend opens the link (or enters the code) → **Join group**.
3. Each of you: Group → **Sharing** tab → set one habit to *Result + notes*, another to
   *Check-in only*, leave one *Private*. Check in. On the other phone, the Members tab
   shows exactly that and no more.
4. Tap **🙏 Praying for you** on your friend → they get a notification.
5. Home → **🆘 I need help** → **Ask for prayer now** → friend is notified; you see the
   calming screen. Trying again within 10 minutes is refused (spam protection).

**Phase 4: polish**
1. Home → **Week in review**. On Sunday at 19:00 you also get a notification for it.
2. Settings → **Set a PIN**. Switch to another app for more than a minute, come back:
   the PIN pad appears.
3. Airplane mode → check in → "Saved on this phone". Turn airplane mode off and open
   the app: it syncs (banner disappears).
4. Settings → **Export my data** downloads a JSON file.
5. (Test account only!) Settings → **Delete my account** removes everything.

---

## Other features

- **Weekly review** (Home → Week in review): days fully checked in, outcomes per habit,
  streaks, and the tags that came up most on harder days. Personal only; there are no
  leaderboards. A notification "Your week in review is ready" comes on Sunday at 19:00
  (switch off in Settings).
- **PIN lock** (Settings → App lock): a 4-digit PIN asked for when the app opens or after
  more than a minute in the background. It's stored on the phone as a salted hash.
  It keeps casual eyes out but isn't a security vault. "Forgot PIN?" signs you out (your
  data is safe on the server).
- **Offline**: the app and your recent data are kept on the phone. Check-ins made
  offline are saved and sent automatically when you're back online.
- **Export my data**: a JSON file with everything the server stores about you.
- **Delete my account**: permanently removes your account and all your data. Groups you
  created stay for the other members.

---

## Working on the code

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
cp .env.example .env.local      # then fill in your Supabase URL and anon key
npm run dev                     # opens http://localhost:5173/accountability/
npm test                        # runs the automated tests (streaks, time targets,
                                #   reminder timing in timezones, weekly summary, push encryption)
npm run build                   # type-checks and builds into dist/
```

---

## Project layout

```
src/
  App.tsx                 routes (which screen shows for which #/address)
  sw.ts                   service worker: offline cache + showing notifications
  lib/groups.ts           groups, sharing and encouragement (database calls)
  lib/push.ts             turning notifications on/off, test notification
  data/DataProvider.tsx   loads/saves your profile, habits and check-ins
  pages/                  one file per screen
  data/offline.ts         on-phone copy of your data + offline check-in queue
  lib/pin.ts              optional PIN lock
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
- Other people can **never** read your habits, check-ins or profile directly. Group
  members only get data through the `group_overview()` database function, which returns
  for each habit exactly what you chose for that group: nothing, "checked in", the
  result, or the result with tags and notes. Notes of habits that aren't shared as
  "Result + notes" are never sent to anyone else's phone.
- The privacy rules are tested against a real Postgres engine (see the commit history);
  if you change `supabase/migrations`, keep them as strict.
- Check-ins can only be written for today and the previous two days.
- Notification text never mentions what a habit is about. Reminders for "avoid" habits
  never include the habit's name.
- The VAPID private key and cron secret live only in Supabase secrets / Vault.
- Signing out removes the on-phone copy of your data and the PIN.
- Secrets never go in this repo. The only values in the built app are the Supabase URL and
  the public anon key, which are designed to be public.
