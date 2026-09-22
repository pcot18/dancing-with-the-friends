# Dancing with the Friends 🪩

A weekly-draft fantasy league for *Dancing with the Stars*, for people who watch it mostly for each other.
Static React app on GitHub Pages, Supabase for login and data. Costs nothing to run.

**The live database is already set up** (Supabase project `dancing-with-the-friends`, keys in `src/supabase.config.js`). `npm install && npm run dev` runs against it. Push to GitHub with Pages enabled and the same build goes live for your friends.

**Demo mode:** `npm run demo` (or add `?demo` to the URL) runs on fake in-memory data: real Season 35 state, the draft room is open and you're on the clock. The other teams are bots; one of them "isn't here" so you can watch the 60-second timer do its thing.

## How the game works

- **Teams.** A league has N teams (you're doing 4 couples). Members of a team (a couple) share one seat in the draft and one roster.
- **Live weekly draft.** Tuesday before the show (room opens **7:30pm ET**), everyone gets in the Draft Room and picks in turn, snake order, **60 seconds on the clock**. Miss your turn and the site picks for you, **completely at random** from whoever's left. Roster size = couples remaining ÷ teams, rounded down; leftover couples go undrafted. The commissioner opens the room (any time); once it's 7:30 anyone in the league can open it.
- **Draft order.** Week 1 random, then reverse standings (last place picks first).
- **Snipe window.** From the last pick until **Tuesday 8pm ET** (show lock). A snipe made in the window is hidden until show lock, then revealed on the Board.
- **Scoring.** Sum of your drafted couples' judges' scores, normalized to a 3-judge / 30-point-per-dance basis. Multi-dance nights count every dance. **Sent home = half points.**
- **Crunch time.** The first week there are fewer couples than teams, everyone picks exactly one, duplicates allowed, points split among owners.
- **The Snipe** (one per team per season): during the snipe window, hand a rival one of your drafted couples and take one of theirs. Sniped couples can't be sniped back that week.
- **Standings.** Season points, then weekly wins.

All the numbers live in `leagues.settings` (JSON) so a league can change them.

## Setup

### Supabase (done)
The project exists, the schema and Season 35 seed are loaded, `pg_cron` and realtime are on, and login is email + password with no confirmation email. The **first account to sign up becomes the site admin** (the one who enters judges' scores); promote others with:
```sql
update profiles set is_admin = true
where user_id = (select id from auth.users where email = 'friend@example.com');
```
To rebuild from scratch on a new project: run `supabase/migrations/*.sql` in order, then `supabase/seed.sql`, and set Auth → Email → "Confirm email" off.

### GitHub Pages (your part)
1. Push this repo to GitHub (public or private, either works for Pages).
2. **Settings → Pages**: Source = *GitHub Actions*.
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys. Your link is `https://<you>.github.io/<repo>/`.

No secrets needed: the Supabase URL and anon key are committed in `src/supabase.config.js`. The anon key is public by design; Row Level Security is what keeps people from picking on someone else's turn.

### Start the league
Open the site, sign in (any email + a 6+ character password; the account is created on the spot), **Start a league**, and text the invite code. Friends sign in the same way, enter the code, and either join an existing team (couples) or make a new one. Two people on a team can share one login or each make their own; both work. Team name, emoji, display name, password and email are all editable under the ⚙️ tab.

## Weekly commissioner routine
1. Tuesday ~7:30pm: open the Draft Room (or let the friends do it at 7:30). Draft happens. Snipe window until 8.
2. After the show (or Wednesday morning): **Commish → Judges' scores** → pick the week → **Auto-fill from Wikipedia** → tick who went home → Save.
3. That's it. Standings, recaps and next week's draft order all update.

**About auto-fill:** there is no official DWTS scores API. The button reads the "Scoring chart" table on the season's Wikipedia page through the MediaWiki API (which allows anonymous cross-origin requests), matches rows to couples by first names, and pre-fills the totals for you to check. Wikipedia editors usually have it within an hour of the show. If the table format changes and the parser can't find it, you get an error and type the numbers by hand (it's 16 numbers, two minutes). Eliminations always need a manual tick because Wikipedia encodes them as cell colors that aren't worth trusting.

## Local development
```
npm install
npm run dev            # live against the real Supabase project
npm run demo           # fake data, no Supabase
npm run build:demo     # single-file demo build in dist-demo/
```
The cast and scouting reports are in `src/data/cast.js`; `node scripts/gen-seed.mjs` regenerates `supabase/seed.sql` from it.

## Layout
```
src/
  App.jsx               shell, auth gate, league gate, tabs, ticker
  screens/              Board, DraftRoom, PowerPlays (the Snipe), Cast, Recap, Commish, Settings, Login, JoinLeague
  supabase.config.js    project URL + anon key
  lib/scoring.js        scoring engine (mirrors the SQL functions)
  lib/supabaseApi.js    real backend
  lib/demoApi.js        fake backend with a mid-season snapshot
  lib/wikipedia.js      score auto-fill
  data/cast.js          Season 35 cast + scouting copy
supabase/
  migrations/               0001 schema · 0002 first-user-is-admin · 0003 ride-or-die retired
  seed.sql                     generated from src/data/cast.js
```

## Going public later
The schema is already multi-tenant: seasons/couples/weeks/scores are global, leagues own only their teams, drafts, picks and power plays. "Public" means: put a landing page in front of it, keep entering scores once a week, and maybe add a Supabase Edge Function that emails "draft room opens in 30 minutes." Every league on the site runs off the same score entry.

## Next season
Edit `src/data/cast.js` (new couples, new week dates, new jokes), regenerate the seed, insert a new `seasons` row with `is_current = true`, and set last season's to `false`.
