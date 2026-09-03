-- Dancing with the Friends — schema, security, draft resolver, power plays.
-- Run this in the Supabase SQL editor (or `supabase db push`), then run seed.sql.

-- ---------------------------------------------------------------------------
-- Global season data (one copy, shared by every league)
-- ---------------------------------------------------------------------------
create table seasons (
  id                serial primary key,
  name              text not null,
  year              int  not null,
  winner_couple_id  int,
  is_current        boolean default true
);

create table couples (
  id              serial primary key,
  season_id       int references seasons on delete cascade,
  celeb           text not null,
  pro             text not null,
  known_for       text,
  tier            int default 2,          -- 1 ringers, 2 contenders, 3 vote machines
  position        text,                   -- "Franchise quarterback"
  grade           text,                   -- "A+"
  floor           int,
  ceiling         int,
  comp            text,
  vote_engine     text,
  bio             text,
  red_flag        text,
  headshot_url    text,
  eliminated_week int                     -- week number, null while alive
);

create table weeks (
  id                serial primary key,
  season_id         int references seasons on delete cascade,
  number            int not null,
  title             text,
  rankings_lock_at  timestamptz not null,   -- draft runs here (Mon 8pm ET)
  show_lock_at      timestamptz not null,   -- power plays close here (Tue 8pm ET)
  judge_count       int default 3,
  resolved          boolean default false,
  unique (season_id, number)
);

create table scores (
  week_id       int references weeks on delete cascade,
  couple_id     int references couples on delete cascade,
  raw_total     numeric not null,   -- sum of every paddle across every dance that night
  max_possible  numeric not null,   -- 30, 40, 60 ... for display
  eliminated    boolean default false,
  primary key (week_id, couple_id)
);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create table profiles (
  user_id       uuid primary key references auth.users on delete cascade,
  display_name  text,
  is_admin      boolean default false    -- can enter judges' scores for the season
);

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Leagues (tenants)
-- ---------------------------------------------------------------------------
create table leagues (
  id            uuid primary key default gen_random_uuid(),
  season_id     int references seasons,
  name          text not null,
  invite_code   text unique not null default upper(substr(md5(random()::text), 1, 6)),
  commissioner  uuid references auth.users,
  created_at    timestamptz default now(),
  settings      jsonb not null default '{
    "elimination_multiplier": 0.5,
    "ride_or_die_weekly": 2,
    "ride_or_die_winner": 20,
    "lift_penalty": 3,
    "snipes_per_season": 1,
    "lifts_per_season": 1
  }'::jsonb
);

create table teams (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid references leagues on delete cascade,
  name           text not null,
  emoji          text default '🪩',
  ride_or_die    int references couples,
  draft_seed     int default floor(random() * 1000000)::int,  -- week 1 order
  created_at     timestamptz default now(),
  unique (league_id, ride_or_die)          -- Ride or Die is exclusive: first to claim wins
);

create table team_members (
  team_id   uuid references teams on delete cascade,
  user_id   uuid references auth.users on delete cascade,
  primary key (team_id, user_id)
);

create table rankings (
  team_id             uuid references teams on delete cascade,
  week_id             int references weeks on delete cascade,
  ordered_couple_ids  int[] not null,
  updated_at          timestamptz default now(),
  primary key (team_id, week_id)
);

create table picks (
  team_id      uuid references teams on delete cascade,
  week_id      int references weeks on delete cascade,
  couple_id    int references couples,
  pick_number  int,                     -- overall pick number; 0 in crunch weeks
  shared       boolean default false,   -- crunch-time pick (points split among owners)
  sniped       boolean default false,   -- moved by a snipe this week; can't be sniped again
  primary key (team_id, week_id, couple_id)
);

create table power_plays (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid references teams on delete cascade,
  week_id          int references weeks on delete cascade,
  kind             text not null check (kind in ('snipe', 'lift')),
  target_team_id   uuid references teams,
  give_couple_id   int references couples,
  take_couple_id   int references couples,
  created_at       timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function is_league_member(p_league uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from team_members tm join teams t on t.id = tm.team_id
    where t.league_id = p_league and tm.user_id = auth.uid()
  );
$$;

create or replace function is_team_member(p_team uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from team_members where team_id = p_team and user_id = auth.uid());
$$;

create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from profiles where user_id = auth.uid()), false);
$$;

create or replace function my_team_in_league(p_league uuid) returns uuid
language sql security definer stable set search_path = public as $$
  select t.id from teams t join team_members tm on tm.team_id = t.id
  where t.league_id = p_league and tm.user_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Scoring (mirrors src/lib/scoring.js — keep the two in sync)
-- ---------------------------------------------------------------------------
-- Points for every pick in a league, with multipliers applied.
create or replace function league_pick_points(p_league uuid)
returns table (team_id uuid, week_id int, couple_id int, points numeric)
language sql stable set search_path = public as $$
  with lg as (select settings from leagues where id = p_league),
  owners as (
    select p.week_id, p.couple_id, count(*) as n
    from picks p join teams t on t.id = p.team_id
    where t.league_id = p_league group by p.week_id, p.couple_id
  )
  select p.team_id, p.week_id, p.couple_id,
    round(
      (s.raw_total * 3.0 / w.judge_count)
      * case when s.eliminated then (lg.settings->>'elimination_multiplier')::numeric else 1 end
      / case when p.shared then o.n else 1 end
    , 2) as points
  from picks p
  join teams t on t.id = p.team_id and t.league_id = p_league
  join weeks w on w.id = p.week_id
  join scores s on s.week_id = p.week_id and s.couple_id = p.couple_id
  join owners o on o.week_id = p.week_id and o.couple_id = p.couple_id
  cross join lg;
$$;

-- Season totals per team: picks + ride-or-die + lift penalties.
create or replace function league_totals(p_league uuid, p_through_week int default 999)
returns table (team_id uuid, total numeric, weekly_wins int)
language sql stable set search_path = public as $$
  with lg as (select settings, season_id from leagues where id = p_league),
  wk as (select id, number from weeks where number <= p_through_week),
  pick_pts as (
    select pp.team_id, pp.week_id, sum(pp.points) as pts
    from league_pick_points(p_league) pp join wk on wk.id = pp.week_id
    group by pp.team_id, pp.week_id
  ),
  lift_pts as (
    select x.target_team_id as team_id, x.week_id,
           -(lg.settings->>'lift_penalty')::numeric as pts
    from power_plays x join teams t on t.id = x.team_id and t.league_id = p_league
    join wk on wk.id = x.week_id cross join lg
    where x.kind = 'lift'
  ),
  rod_pts as (
    select t.id as team_id, s.week_id,
      (lg.settings->>'ride_or_die_weekly')::numeric as pts
    from teams t join scores s on s.couple_id = t.ride_or_die
    join wk on wk.id = s.week_id cross join lg
    where t.league_id = p_league and not s.eliminated
  ),
  winner_pts as (
    select t.id as team_id, null::int as week_id,
      (lg.settings->>'ride_or_die_winner')::numeric as pts
    from teams t join seasons se on se.id = (select season_id from lg) cross join lg
    where t.league_id = p_league and se.winner_couple_id = t.ride_or_die
  ),
  week_pts as (
    select team_id, week_id, sum(pts) as pts from (
      select * from pick_pts union all select * from lift_pts union all select * from rod_pts
    ) u group by team_id, week_id
  ),
  wins as (
    select team_id, count(*) as n from (
      select team_id, week_id, rank() over (partition by week_id order by pts desc) r from week_pts
    ) ranked where r = 1 group by team_id
  )
  select t.id,
    coalesce((select sum(pts) from week_pts where team_id = t.id), 0)
      + coalesce((select sum(pts) from winner_pts where team_id = t.id), 0) as total,
    coalesce((select n from wins where team_id = t.id), 0)::int as weekly_wins
  from teams t where t.league_id = p_league;
$$;

-- ---------------------------------------------------------------------------
-- Draft resolver: runs at rankings_lock_at for every league in the season
-- ---------------------------------------------------------------------------
create or replace function resolve_week(p_week int) returns int
language plpgsql security definer set search_path = public as $$
declare
  w        weeks%rowtype;
  lg       record;
  n_teams  int;
  alive    int[];
  n_alive  int;
  roster   int;
  order_ids uuid[];
  r        int;
  i        int;
  tid      uuid;
  ranked   int[];
  chosen   int;
  taken    int[];
  pickno   int;
  leagues_done int := 0;
begin
  select * into w from weeks where id = p_week;
  if w is null then raise exception 'no such week'; end if;

  -- couples still standing
  select coalesce(array_agg(id order by id), '{}') into alive
  from couples where season_id = w.season_id and eliminated_week is null;
  n_alive := coalesce(array_length(alive, 1), 0);

  for lg in select * from leagues where season_id = w.season_id loop
    delete from picks where week_id = p_week
      and team_id in (select id from teams where league_id = lg.id);

    select count(*) into n_teams from teams where league_id = lg.id;
    if n_teams = 0 then continue; end if;

    -- draft order: week 1 by seed, otherwise reverse standings (last place first)
    if w.number = 1 then
      select array_agg(id order by draft_seed) into order_ids from teams where league_id = lg.id;
    else
      select array_agg(t.id order by lt.total asc, lt.weekly_wins asc, t.draft_seed)
      into order_ids
      from teams t join league_totals(lg.id, w.number - 1) lt on lt.team_id = t.id
      where t.league_id = lg.id;
    end if;

    taken := '{}';
    pickno := 0;

    if n_alive < n_teams then
      -- CRUNCH TIME: everyone takes their top-ranked living couple; duplicates allowed
      foreach tid in array order_ids loop
        select ordered_couple_ids into ranked from rankings where team_id = tid and week_id = p_week;
        chosen := null;
        if ranked is not null then
          foreach i in array ranked loop
            if i = any(alive) then chosen := i; exit; end if;
          end loop;
        end if;
        if chosen is null then chosen := best_available(p_week, alive, '{}'); end if;
        insert into picks (team_id, week_id, couple_id, pick_number, shared)
        values (tid, p_week, chosen, 0, true);
      end loop;
    else
      roster := n_alive / n_teams;
      for r in 1..roster loop
        for i in 1..n_teams loop
          -- snake: odd rounds forward, even rounds backward
          tid := case when r % 2 = 1 then order_ids[i] else order_ids[n_teams - i + 1] end;
          select ordered_couple_ids into ranked from rankings where team_id = tid and week_id = p_week;
          chosen := null;
          if ranked is not null then
            declare c int;
            begin
              foreach c in array ranked loop
                if c = any(alive) and not (c = any(taken)) then chosen := c; exit; end if;
              end loop;
            end;
          end if;
          if chosen is null then chosen := best_available(p_week, alive, taken); end if;
          pickno := pickno + 1;
          taken := taken || chosen;
          insert into picks (team_id, week_id, couple_id, pick_number, shared)
          values (tid, p_week, chosen, pickno, false);
        end loop;
      end loop;
    end if;
    leagues_done := leagues_done + 1;
  end loop;

  update weeks set resolved = true where id = p_week;
  return leagues_done;
end $$;

-- Fallback when a team never submitted a ranking: best score last week, else lowest id.
create or replace function best_available(p_week int, p_alive int[], p_taken int[]) returns int
language sql stable set search_path = public as $$
  with prev as (
    select s.couple_id, s.raw_total from scores s join weeks w on w.id = s.week_id
    where w.number = (select number - 1 from weeks where id = p_week)
      and w.season_id = (select season_id from weeks where id = p_week)
  )
  select c.id from couples c left join prev on prev.couple_id = c.id
  where c.id = any(p_alive) and not (c.id = any(p_taken))
  order by prev.raw_total desc nulls last, c.id asc limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Power plays
-- ---------------------------------------------------------------------------
-- SNIPE: between rankings lock and show lock, swap one of your drafted couples
-- for one of a rival's. Once per season. A sniped couple can't be re-sniped that week.
create or replace function use_snipe(p_week int, p_target_team uuid, p_give int, p_take int)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid; lg uuid; w weeks%rowtype; used int; allowed int;
begin
  select * into w from weeks where id = p_week;
  select league_id into lg from teams where id = p_target_team;
  me := my_team_in_league(lg);
  if me is null then raise exception 'You are not on a team in this league'; end if;
  if me = p_target_team then raise exception 'You cannot snipe yourself, although we respect it'; end if;
  if not w.resolved then raise exception 'The draft has not run yet'; end if;
  if now() >= w.show_lock_at then raise exception 'Too late — the show is live'; end if;
  select (settings->>'snipes_per_season')::int into allowed from leagues where id = lg;
  select count(*) into used from power_plays where team_id = me and kind = 'snipe';
  if used >= allowed then raise exception 'No snipes left this season'; end if;
  if not exists (select 1 from picks where team_id = me and week_id = p_week and couple_id = p_give and not sniped)
    then raise exception 'You do not own that couple this week (or they were already sniped)'; end if;
  if not exists (select 1 from picks where team_id = p_target_team and week_id = p_week and couple_id = p_take and not sniped)
    then raise exception 'They do not own that couple this week (or they were already sniped)'; end if;
  if exists (select 1 from picks where week_id = p_week and team_id in (me, p_target_team) and shared)
    then raise exception 'No snipes during crunch time'; end if;

  update picks set team_id = p_target_team, sniped = true where team_id = me and week_id = p_week and couple_id = p_give;
  update picks set team_id = me, sniped = true where team_id = p_target_team and week_id = p_week and couple_id = p_take;
  insert into power_plays (team_id, week_id, kind, target_team_id, give_couple_id, take_couple_id)
  values (me, p_week, 'snipe', p_target_team, p_give, p_take);
end $$;

-- ILLEGAL LIFT: Carrie Ann's favorite. Once per season, flag a rival for an illegal
-- lift and dock them 3 points that week. Declared before show lock; revealed at lock.
create or replace function use_lift(p_week int, p_target_team uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid; lg uuid; w weeks%rowtype; used int; allowed int;
begin
  select * into w from weeks where id = p_week;
  select league_id into lg from teams where id = p_target_team;
  me := my_team_in_league(lg);
  if me is null then raise exception 'You are not on a team in this league'; end if;
  if me = p_target_team then raise exception 'You cannot flag yourself'; end if;
  if now() >= w.show_lock_at then raise exception 'Too late — the show is live'; end if;
  select (settings->>'lifts_per_season')::int into allowed from leagues where id = lg;
  select count(*) into used from power_plays where team_id = me and kind = 'lift';
  if used >= allowed then raise exception 'No illegal-lift flags left this season'; end if;
  if exists (select 1 from power_plays where week_id = p_week and kind = 'lift' and target_team_id = p_target_team)
    then raise exception 'That team has already been flagged this week'; end if;
  insert into power_plays (team_id, week_id, kind, target_team_id) values (me, p_week, 'lift', p_target_team);
end $$;

-- ---------------------------------------------------------------------------
-- League creation / joining (security definer so RLS doesn't fight the flow)
-- ---------------------------------------------------------------------------
create or replace function create_league(p_name text, p_team_name text, p_emoji text default '🪩')
returns uuid language plpgsql security definer set search_path = public as $$
declare lid uuid; tid uuid;
begin
  insert into leagues (season_id, name, commissioner)
  values ((select id from seasons where is_current order by id desc limit 1), p_name, auth.uid())
  returning id into lid;
  insert into teams (league_id, name, emoji) values (lid, p_team_name, p_emoji) returning id into tid;
  insert into team_members (team_id, user_id) values (tid, auth.uid());
  return lid;
end $$;

-- Join by invite code: either join an existing team (couples!) or create a new one.
create or replace function join_league(p_code text, p_team_id uuid default null, p_team_name text default null, p_emoji text default '🪩')
returns uuid language plpgsql security definer set search_path = public as $$
declare lid uuid; tid uuid;
begin
  select id into lid from leagues where invite_code = upper(trim(p_code));
  if lid is null then raise exception 'No league with that code'; end if;
  if my_team_in_league(lid) is not null then return lid; end if;
  if p_team_id is not null then
    if not exists (select 1 from teams where id = p_team_id and league_id = lid) then raise exception 'Bad team'; end if;
    tid := p_team_id;
  else
    insert into teams (league_id, name, emoji) values (lid, coalesce(p_team_name, 'Team ' || upper(substr(md5(random()::text),1,4))), p_emoji)
    returning id into tid;
  end if;
  insert into team_members (team_id, user_id) values (tid, auth.uid());
  return lid;
end $$;

-- Lets the join screen list teams for a code before the user is a member.
create or replace function teams_for_code(p_code text)
returns table (id uuid, name text, emoji text, league_name text, member_count int)
language sql security definer stable set search_path = public as $$
  select t.id, t.name, t.emoji, l.name, (select count(*) from team_members where team_id = t.id)::int
  from teams t join leagues l on l.id = t.league_id
  where l.invite_code = upper(trim(p_code));
$$;

-- Commissioner (or admin) can re-run the draft for a week, e.g. after a late ranking.
create or replace function rerun_draft(p_week int) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and not exists (select 1 from leagues where commissioner = auth.uid())
    then raise exception 'Commissioners only'; end if;
  return resolve_week(p_week);
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table seasons enable row level security;
alter table couples enable row level security;
alter table weeks enable row level security;
alter table scores enable row level security;
alter table profiles enable row level security;
alter table leagues enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table rankings enable row level security;
alter table picks enable row level security;
alter table power_plays enable row level security;

-- Global season data: anyone signed in can read; only admins write.
create policy "read seasons" on seasons for select to authenticated using (true);
create policy "read couples" on couples for select to authenticated using (true);
create policy "read weeks"   on weeks   for select to authenticated using (true);
create policy "read scores"  on scores  for select to authenticated using (true);
create policy "admin seasons" on seasons for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin couples" on couples for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin weeks"   on weeks   for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin scores"  on scores  for all to authenticated using (is_admin()) with check (is_admin());

create policy "read profiles" on profiles for select to authenticated using (true);
create policy "edit own profile" on profiles for update to authenticated using (user_id = auth.uid());

create policy "read my leagues" on leagues for select to authenticated using (is_league_member(id) or commissioner = auth.uid());
create policy "commissioner edits league" on leagues for update to authenticated using (commissioner = auth.uid());

create policy "read teams" on teams for select to authenticated using (is_league_member(league_id));
create policy "edit my team" on teams for update to authenticated using (is_team_member(id));

create policy "read members" on team_members for select to authenticated
  using (is_league_member((select league_id from teams where id = team_id)));

create policy "read rankings after lock" on rankings for select to authenticated
  using (is_team_member(team_id) or (
    is_league_member((select league_id from teams where id = team_id))
    and now() >= (select rankings_lock_at from weeks where id = week_id)));
create policy "write my ranking before lock" on rankings for insert to authenticated
  with check (is_team_member(team_id) and now() < (select rankings_lock_at from weeks where id = week_id));
create policy "update my ranking before lock" on rankings for update to authenticated
  using (is_team_member(team_id) and now() < (select rankings_lock_at from weeks where id = week_id));

create policy "read picks" on picks for select to authenticated
  using (is_league_member((select league_id from teams where id = team_id)));

-- Power plays are visible to the league only once the show has locked (the reveal),
-- except your own, which you can always see.
create policy "read power plays" on power_plays for select to authenticated
  using (is_team_member(team_id) or (
    is_league_member((select league_id from teams where id = team_id))
    and now() >= (select show_lock_at from weeks where id = week_id)));

-- ---------------------------------------------------------------------------
-- Scheduling: run the draft automatically at each week's rankings lock.
-- Requires the pg_cron extension (Database → Extensions → pg_cron).
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
select cron.schedule('dwtf-resolve-drafts', '*/5 * * * *', $$
  select resolve_week(id) from weeks
  where not resolved and rankings_lock_at <= now() and rankings_lock_at > now() - interval '2 days';
$$);
