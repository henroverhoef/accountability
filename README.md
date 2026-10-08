# Steadfast

A small, private app for daily habits and Christian accountability among friends.
Build good habits (quiet time, bedtime, exercise), break bad ones, check in honestly
every day, and encourage each other in small groups.

It's a **Progressive Web App**: a website that installs to the home screen like an app,
works offline and can send notifications. It's hosted free on **GitHub Pages**, with
data in a free **Supabase** project.

**No email or password.** People open the link, type their first name and the group
code, and they're in. Each phone gets its own private account. A personal *login code*
(Settings → Login code) lets someone move to a new phone.

---

## Setup

Everything is set up. The app lives at **https://accountability-five.vercel.app/**.

- **Supabase** project **steadfast** (`qvqbnwmcordnfcttdbkg`): database tables and
  security rules, the two server functions (`push`, `login`), notification keys, the
  5-minute reminder scheduler, and "Allow anonymous sign-ins" (Authentication →
  Sign In / Providers) switched on. The app's public Supabase address and key are in
  `.env.production`.
- **Vercel** builds and hosts the app, and rebuilds it automatically on every push to
  `main`. It has its own address on purpose: on GitHub Pages every app of yours shares
  `henroverhoef.github.io`, so Chrome mixed up install status and notification
  permission with Beursie. (Optional: Vercel → Project → Settings → Domains to rename it.)
- **GitHub Actions** (`.github/workflows/deploy.yml`) runs the tests on every push and
  publishes a small redirect on the old address
  (`henroverhoef.github.io/accountability/` → the Vercel address), so old links still
  work.

### Optional: automatic Supabase updates

When the database or server functions change in this repo, they need to be applied to
Supabase. Either ask Claude (with the Supabase connector) to apply them, or let GitHub
do it automatically by adding three repository secrets (**Settings → Secrets and
variables → Actions**):

| Name | Value |
|------|-------|
| `SUPABASE_PROJECT_REF` | `qvqbnwmcordnfcttdbkg` |
| `SUPABASE_DB_PASSWORD` | the database password from when the project was created (reset it under Project Settings → Database if needed) |
| `SUPABASE_ACCESS_TOKEN` | a token from <https://supabase.com/dashboard/account/tokens> |

### Start your group

1. Open the address on your phone and install it (see below).
2. Choose **Start a new group**, enter your name and a group name.
3. Open the group → **Invite** tab → **Share invite link**, and send it to the men in
   your group (e.g. on WhatsApp). The link fills in the group code for them.
4. Make your **login code** when asked (or in Settings) and keep it somewhere safe.

---

## Installing the app on a phone

**Android (Chrome)**
1. Open the link in Chrome.
2. Tap the **⋮** menu → **Install app** (not "Create shortcut") → **Install**.
3. Open Steadfast from the icon, join, then **Settings → Turn on notifications**.

**iPhone (Safari, iOS 16.4 or newer)**
1. Open the link in **Safari** (iPhones only install web apps from Safari).
2. Tap **Share** (square with an arrow) → **Add to Home Screen** → **Add**.
3. Open Steadfast **from the home screen icon** and join there. (On iPhone the installed
   app and Safari keep separate data, so the app shows these steps first.)
4. **Settings → Turn on notifications** → Allow.

**New phone?** On the old phone: Settings → Login code → create one. On the new phone
choose **I already use Steadfast** and type it in.

---

## Testing on your phone (checklist)

1. **Basics:** install, start a group, pick habits, tap **Check in**, answer, **Save**.
   Try *Slipped*: you should see a verse and a "reach out" button. Check **Last night** too.
   Habits → tap one → the calendar shows your days.
2. **Notifications:** Settings → **Turn on notifications** → **Send test**. Then set the
   evening reminder ~10 minutes ahead and don't check in. It arrives within 5 minutes
   of that time (the server checks every 5 minutes).
3. **Group** (with a friend): send him the invite link; he joins with his name. Each of
   you: Group → **Sharing** → set one habit to *Result + notes*, one to *Check-in only*,
   leave one *Private*, then check in. Each phone should see exactly that and no more.
   Tap **🙏 Praying for you** → he gets a notification. Home → **🆘 I need help** → he's
   notified and you see the calming screen.
4. **Login code:** Settings → create a login code. On another phone or browser choose
   *I already use Steadfast* and enter it: your habits and history appear.
5. **Extras:** Home → **Week in review**; Settings → **Set a PIN**; airplane mode →
   check in → turn it off → it syncs; Settings → **Export my data**.

---

## Other features

- **Missed last night?** Home shows "Last night's check-in is still open" until midnight,
  and a morning reminder (07:30 by default) points to it. Catch-up check-ins appear in the
  group feed marked "caught up next morning". Anything older can't be filled in.
- **Score out of 10** habits (e.g. Thankfulness: "How thankful was I today?"): answer with
  a slider. 7–10 counts as a strong day (green), 4–6 mixed (amber), 1–3 hard (red);
  habit pages and the weekly review show the average.
- **Member details**: in a group, tap someone's name to see their shared habits, a
  6-week calendar, and the last two weeks of check-ins with tags and notes (only what
  they share with that group).
- **Quick tip**: shown once after setup, explaining how to install the app and turn on
  notifications (Settings → Help shows it again).
- **Weekly review** (Home → Week in review): days fully checked in, outcomes per habit,
  streaks, and the tags that came up most on harder days. Personal only; there are no
  leaderboards. A notification "Your week in review is ready" comes on Sunday at 19:00
  (switch off in Settings).
- **PIN lock** (Settings → App lock): a 4-digit PIN asked for when the app opens or after
  more than a minute in the background. It's stored on the phone as a salted hash.
  It keeps casual eyes out but isn't a security vault. "Forgot PIN?" signs you out; you get back
  in with your login code.
- **Offline**: the app and your recent data are kept on the phone. Check-ins made
  offline are saved and sent automatically when you're back online.
- **Export my data**: a JSON file with everything the server stores about you.
- **Delete my account**: permanently removes your account and all your data. Groups you
  created stay for the other members.
- **Reminders**: every 5 minutes the server checks each person's reminder times in
  their own timezone and sends what's due, once, and only if they haven't checked in
  yet: evening reminder (default 21:30), a nudge an hour later, a morning nudge about
  yesterday, per-habit reminders and a wind-down reminder before a bedtime target.
- **Groups**: the creator is admin (rename, new invite code, remove members). Sharing
  is per habit, per group: Private · Check-in only · Result · Result + notes (default:
  joining a group or adding a habit shares it as Result + notes; change it any time).
  Members who haven't checked in for 3+ days are highlighted. 🆘 requests reach the
  group even in their quiet hours, at most once per 10 minutes per group.

---

## Working on the code

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
cp .env.example .env.local      # then fill in your Supabase URL and anon key
                                # (Supabase → Project Settings → API)
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
  pages/                  one file per screen (Welcome.tsx = name + group code)
  data/offline.ts         on-phone copy of your data + offline check-in queue
  lib/pin.ts              optional PIN lock
  components/             reusable pieces (check-in card, heatmap, …)
  lib/                    templates, Bible verses, labels, Supabase client
supabase/
  migrations/             database tables + security rules (run in order)
  functions/push/         Edge Function that sends every notification
  functions/login/        Edge Function for personal login codes
  functions/_shared/      server helpers; logic/ = pure rules shared with the app
                          (dates, streaks, reminder timing, web push encryption)
tests/                    automated tests (npm test)
.github/workflows/        deploy.yml: sets up Supabase and publishes the app
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
- Check-ins can only be written for today and last night (the database enforces this).
- Notification text never mentions what a habit is about. Reminders for "avoid" habits
  never include the habit's name.
- Accounts have no email or password. Each phone holds its own sign-in. Login codes are
  stored only as a hash; anyone who has someone's login code can open that account, so
  keep it private.
- The server's notification keys and scheduler secret are created automatically and
  kept in a table (`app_secrets`) that only the server can read.
- `.env.production` contains only the project's *public* address and publishable key,
  which every visitor's browser receives anyway; the database rules protect the data.
- If you add the optional `SUPABASE_ACCESS_TOKEN` GitHub secret: it can manage your
  Supabase account. GitHub keeps it encrypted and only the deploy workflow uses it; you
  can revoke it any time on the Supabase tokens page.
- Signing out removes the on-phone copy of your data and the PIN.
- Secrets never go in this repo. The only values in the built app are the Supabase URL and
  the public anon key, which are designed to be public.

---

## Troubleshooting

- **"The app's setup isn't finished yet (anonymous sign-ins is off)"**: Supabase →
  **Authentication → Sign In / Providers → Allow anonymous sign-ins** → on (setup step 1).
- **Notifications don't arrive**: Settings → *Send test*. If that fails, check
  Supabase → Edge Functions → `push` → Logs. On iPhone the app must be opened from the
  home screen icon.
- **Someone lost their phone and had no login code**: the account can't be recovered.
  They can join again with the group code as a new member (an admin can remove the old
  one under Group → Invite).
- **Changing the database**: add a new file in `supabase/migrations/` (never edit one
  that has already run). It's applied automatically if the optional secrets are set
  (setup step 4); otherwise apply it in the Supabase SQL Editor or ask Claude.
