# Dancing with the Friends 🪩

A weekly-draft fantasy league for *Dancing with the Stars*, for people who watch it mostly for each other.
Static React app on GitHub Pages, Supabase for login and data. Costs nothing to run.

**Try it without setting anything up:** `npm install && npm run demo` (or open the deployed site with `?demo` on the URL). Demo mode uses fake in-memory data: week 4 of Season 35, the draft room is open and you're on the clock. The other teams are bots; one of them "isn't here" so you can watch the 60-second timer do its thing.

## How the game works

- **Teams.** A league has N teams (you're doing 4 couples). Members of a team (a couple) share one seat in the draft and one roster.
- **Live weekly draft.** Tuesday before the show (room opens **7pm ET**), everyone gets in the Draft Room and picks in turn, snake order, **60 seconds on the clock**. Miss your turn and the site picks for you, **completely at random** from whoever's left. Roster size = couples remaining ÷ teams, rounded down; leftover couples go undrafted. The commissioner opens the room (any time); once it's 7pm anyone in the league can open it.
- **Draft order.** Week 1 random, then reverse standings (last place picks first).
- **Trade window.** From the last pick until **Tuesday 8pm ET** (show lock). Power plays can be used; they're hidden until show lock, then revealed on the Board.
- **Scoring.** Sum of your drafted couples' judges' scores, normalized to a 3-judge / 30-point-per-dance basis. Multi-dance nights count every dance. **Sent home = half points.**
- **Ride or Die.** One exclusive season-long couple per team, claimed before the week 1 draft room opens. +2 every week they survive, +20 if they win the Mirrorball.
- **Crunch time.** The first week there are fewer couples than teams, everyone picks exactly one, duplicates allowed, points split among owners.
- **Power plays** (one each per season): 🎯 **The Snipe** (force a trade of a drafted couple with a rival during the trade window) and 🚩 **The Illegal Lift** (flag a rival, minus 3 that week).
- **Standings.** Season points, then weekly wins, then Ride or Die points.

All the numbers live in `leagues.settings` (JSON) so a league can change them.

## Setup (about 20 minutes)

### 1. Supabase
1. Create a project at supabase.com.
2. **SQL Editor** → paste and run `supabase/migrations/0001_schema.sql`, then `supabase/seed.sql`.
3. **Database → Extensions** → make sure `pg_cron` is enabled. The draft clock is normally enforced by whoever has the page open (any member's browser triggers the random pick when the 60s is up, and the server double-checks the time); the cron job is the once-a-minute backstop for when every tab is closed.
   **Database → Replication** → confirm `drafts` and `picks` are in the `supabase_realtime` publication (the migration adds them) so the room updates live for everyone.
4. **Authentication → Providers → Email**: keep Email on, turn *off* "Confirm email" if you want, and make sure magic links are enabled.
5. **Authentication → URL Configuration**: set Site URL to your GitHub Pages URL (`https://<you>.github.io/<repo>/`) and add it to Redirect URLs.
6. **Project Settings → API**: copy the Project URL and the `anon` public key.

### 2. Make yourself the site admin (the one who enters scores)
Sign in to the app once (so your profile row exists), then in the SQL editor:
```sql
update profiles set is_admin = true
where user_id = (select id from auth.users where email = 'you@example.com');
```
Scores are global: one admin entering Tuesday's paddles updates every league on the site.

### 3. GitHub Pages
1. Push this repo to GitHub.
2. **Settings → Secrets and variables → Actions**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. **Settings → Pages**: Source = *GitHub Actions*.
4. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys. Your link is `https://<you>.github.io/<repo>/`.

The anon key is safe to ship in the browser; Row Level Security in the schema is what keeps people from picking on someone else's turn.

### 4. Start the league
Open the site, sign in, **Start a league**, and text the invite code. Friends sign in with their email, enter the code, and either join an existing team (couples) or make a new one. Everyone claims a Ride or Die before the week 1 lock.

## Weekly commissioner routine
1. Tuesday ~7pm: open the Draft Room (or let the friends do it at 7). Draft happens. Trade window until 8.
2. After the show (or Wednesday morning): **Commish → Judges' scores** → pick the week → **Auto-fill from Wikipedia** → tick who went home → Save.
3. That's it. Standings, recaps, draft order for next week, and Ride or Die bonuses all update.

**About auto-fill:** there is no official DWTS scores API. The button reads the "Scoring chart" table on the season's Wikipedia page through the MediaWiki API (which allows anonymous cross-origin requests), matches rows to couples by first names, and pre-fills the totals for you to check. Wikipedia editors usually have it within an hour of the show. If the table format changes and the parser can't find it, you get an error and type the numbers by hand (it's 16 numbers, two minutes). Eliminations always need a manual tick because Wikipedia encodes them as cell colors that aren't worth trusting.

## Local development
```
cp .env.example .env   # add your Supabase URL + anon key
npm install
npm run dev            # live against Supabase
npm run demo           # fake data, no Supabase
npm run build:demo     # single-file demo build in dist-demo/
```
The cast and scouting reports are in `src/data/cast.js`; `node scripts/gen-seed.mjs` regenerates `supabase/seed.sql` from it.

## Layout
```
src/
  App.jsx               shell, auth gate, league gate, tabs, ticker
  screens/              Board, DraftRoom, PowerPlays, Cast, Recap, Commish, Login, JoinLeague
  lib/scoring.js        scoring engine (mirrors the SQL functions)
  lib/supabaseApi.js    real backend
  lib/demoApi.js        fake backend with a mid-season snapshot
  lib/wikipedia.js      score auto-fill
  data/cast.js          Season 35 cast + scouting copy
supabase/
  migrations/0001_schema.sql   tables, RLS, live-draft RPCs, power-play RPCs, pg_cron, realtime
  seed.sql                     generated from src/data/cast.js
```

## Going public later
The schema is already multi-tenant: seasons/couples/weeks/scores are global, leagues own only their teams, drafts, picks and power plays. "Public" means: put a landing page in front of it, keep entering scores once a week, and maybe add a Supabase Edge Function that emails "draft room opens in 30 minutes." Every league on the site runs off the same score entry.

## Next season
Edit `src/data/cast.js` (new couples, new week dates, new jokes), regenerate the seed, insert a new `seasons` row with `is_current = true`, and set last season's to `false`.
