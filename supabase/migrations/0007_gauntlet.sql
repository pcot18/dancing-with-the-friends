-- The Guillermo Gauntlet (week 6+): after the draft, each team picks the three couples that
-- will be in the bottom three (+10 if exactly right), and votes whether the target couple
-- (Guillermo) goes home, staking 5 points. Winners split the losers' stakes; unanimous = no exchange.
alter table weeks add column if not exists bottom_three int[];

create table if not exists gauntlet (
  team_id     uuid references teams on delete cascade,
  week_id     int references weeks on delete cascade,
  bottom_ids  int[] not null,
  target_out  boolean not null,
  updated_at  timestamptz default now(),
  primary key (team_id, week_id)
);
alter table gauntlet enable row level security;
create policy "read gauntlet" on gauntlet for select to authenticated
  using (is_team_member(team_id) or (
    is_league_member((select league_id from teams where id = team_id))
    and exists (select 1 from scores s where s.week_id = gauntlet.week_id)));
alter publication supabase_realtime add table gauntlet;

create or replace function make_gauntlet(p_league uuid, p_week int, p_bottom int[], p_out boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  me := my_team_in_league(p_league);
  if me is null then raise exception 'You are not on a team in this league'; end if;
  if not exists (select 1 from drafts where league_id = p_league and week_id = p_week and status = 'done') then raise exception 'Run the Gauntlet after the draft'; end if;
  if exists (select 1 from scores where week_id = p_week) then raise exception 'Too late — scores are in'; end if;
  if array_length(p_bottom, 1) <> 3 or (select count(distinct x) from unnest(p_bottom) x) <> 3 then raise exception 'Pick exactly three different couples'; end if;
  if exists (select 1 from unnest(p_bottom) x where not exists (select 1 from couples c where c.id = x and c.eliminated_week is null)) then raise exception 'One of those couples is already gone'; end if;
  insert into gauntlet (team_id, week_id, bottom_ids, target_out) values (me, p_week, p_bottom, p_out)
  on conflict (team_id, week_id) do update set bottom_ids = excluded.bottom_ids, target_out = excluded.target_out, updated_at = now();
end $$;

-- reveal length is a league setting now (the Super Bowl show needs longer than Mariah)
create or replace function start_draft(p_league uuid, p_week int) returns void
language plpgsql security definer set search_path = public as $$
declare
  w weeks%rowtype; n int; alive int; ord uuid[]; roster int; crunch boolean; mode text; rev int;
begin
  select * into w from weeks where id = p_week;
  if not exists (select 1 from leagues where id = p_league and commissioner = auth.uid()) and not is_admin()
    then raise exception 'Only the commissioner can start the draft'; end if;
  if exists (select 1 from drafts where league_id = p_league and week_id = p_week) then raise exception 'Draft already started'; end if;
  if exists (select 1 from scores where week_id = p_week) then raise exception 'That week is already scored'; end if;
  select count(*) into n from teams where league_id = p_league;
  select count(*) into alive from couples where season_id = w.season_id and eliminated_week is null;
  if n = 0 or alive = 0 then raise exception 'Nothing to draft'; end if;
  select coalesce(settings->>'draft_order', 'random'), coalesce((settings->>'reveal_seconds')::int, 10) into mode, rev from leagues where id = p_league;
  if mode = 'reverse_standings' and exists (select 1 from picks p join teams t on t.id = p.team_id where t.league_id = p_league) then
    select array_agg(t.id order by lt.total asc, lt.weekly_wins asc, random()) into ord
    from teams t join league_totals(p_league, w.number - 1) lt on lt.team_id = t.id where t.league_id = p_league;
  else
    select array_agg(id order by random()) into ord from teams where league_id = p_league;
  end if;
  crunch := alive < n;
  roster := case when crunch then 1 else alive / n end;
  delete from picks where week_id = p_week and team_id in (select id from teams where league_id = p_league);
  insert into drafts (league_id, week_id, order_ids, roster, crunch, reveal_seconds, pick_deadline_at)
  values (p_league, p_week, ord, roster, crunch, rev, now() + make_interval(secs => rev) + interval '60 seconds');
end $$;

update leagues set settings = settings || '{"gauntlet_bottom_points": 10, "gauntlet_stake": 5, "gauntlet_target_couple": 11, "reveal_seconds": 22}'::jsonb;
update weeks set title = 'Super Bowl Night' where number = 6;

create or replace function league_totals(p_league uuid, p_through_week int default 999)
returns table (team_id uuid, total numeric, weekly_wins int)
language sql stable set search_path = public as $$
  with lg as (select settings from leagues where id = p_league),
  wk as (select id, number from weeks where number <= p_through_week),
  pick_pts as (
    select pp.team_id, pp.week_id, sum(pp.points) as pts
    from league_pick_points(p_league) pp join wk on wk.id = pp.week_id group by pp.team_id, pp.week_id
  ),
  call_pts as (
    select pr.team_id, pr.week_id, (lg.settings->>'elim_call_points')::numeric as pts
    from predictions pr join teams t on t.id = pr.team_id and t.league_id = p_league
    join wk on wk.id = pr.week_id
    join scores s on s.week_id = pr.week_id and s.couple_id = pr.couple_id and s.eliminated
    cross join lg
    where coalesce((lg.settings->>'elim_call_requires_score')::boolean, true) = false
       or s.raw_total * 3.0 / (select judge_count from weeks where id = pr.week_id) = pr.predicted_score
  ),
  bottom_pts as (
    select g.team_id, g.week_id, (lg.settings->>'gauntlet_bottom_points')::numeric as pts
    from gauntlet g join teams t on t.id = g.team_id and t.league_id = p_league
    join weeks w on w.id = g.week_id join wk on wk.id = g.week_id cross join lg
    where w.bottom_three is not null and array_length(w.bottom_three, 1) = 3
      and (select array_agg(x order by x) from unnest(g.bottom_ids) x) = (select array_agg(x order by x) from unnest(w.bottom_three) x)
  ),
  vote as (
    select g.team_id, g.week_id, g.target_out,
      exists (select 1 from scores s where s.week_id = g.week_id and s.couple_id = (lg.settings->>'gauntlet_target_couple')::int and s.eliminated) as actual_out,
      exists (select 1 from scores s where s.week_id = g.week_id) as scored
    from gauntlet g join teams t on t.id = g.team_id and t.league_id = p_league join wk on wk.id = g.week_id cross join lg
  ),
  vote_pts as (
    select v.team_id, v.week_id,
      case when (select count(distinct target_out) from vote v2 where v2.week_id = v.week_id) < 2 then 0
           when v.target_out = v.actual_out then (lg.settings->>'gauntlet_stake')::numeric
                * (select count(*) from vote v2 where v2.week_id = v.week_id and v2.target_out <> v.actual_out)::numeric
                / (select count(*) from vote v2 where v2.week_id = v.week_id and v2.target_out = v.actual_out)::numeric
           else -(lg.settings->>'gauntlet_stake')::numeric end as pts
    from vote v cross join lg where v.scored
  ),
  week_pts as (
    select team_id, week_id, sum(pts) as pts from (
      select * from pick_pts union all select * from call_pts union all select * from bottom_pts union all select * from vote_pts
    ) u group by team_id, week_id
  ),
  wins as (
    select team_id, count(*) as n from (
      select team_id, week_id, rank() over (partition by week_id order by pts desc) r from week_pts
    ) ranked where r = 1 group by team_id
  )
  select t.id,
    coalesce((select sum(pts) from week_pts where team_id = t.id), 0) as total,
    coalesce((select n from wins where team_id = t.id), 0)::int as weekly_wins
  from teams t where t.league_id = p_league;
$$;
