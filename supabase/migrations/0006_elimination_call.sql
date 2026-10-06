-- The Elimination Call: after the draft, each team guesses who goes home and that couple's
-- judges' score. Both right = bonus points (default 10). Hidden from rivals until scores are in.
create table if not exists predictions (
  team_id          uuid references teams on delete cascade,
  week_id          int references weeks on delete cascade,
  couple_id        int references couples not null,
  predicted_score  numeric not null,
  updated_at       timestamptz default now(),
  primary key (team_id, week_id)
);
alter table predictions enable row level security;
create policy "read predictions" on predictions for select to authenticated
  using (is_team_member(team_id) or (
    is_league_member((select league_id from teams where id = team_id))
    and exists (select 1 from scores s where s.week_id = predictions.week_id)));

-- Save/replace your team's call. Allowed once the draft is done and until scores exist.
create or replace function make_call(p_league uuid, p_week int, p_couple int, p_score numeric)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  me := my_team_in_league(p_league);
  if me is null then raise exception 'You are not on a team in this league'; end if;
  if not exists (select 1 from drafts where league_id = p_league and week_id = p_week and status = 'done') then raise exception 'Make your call after the draft'; end if;
  if exists (select 1 from scores where week_id = p_week) then raise exception 'Too late — scores are in'; end if;
  if not exists (select 1 from couples where id = p_couple and eliminated_week is null) then raise exception 'That couple is not in the running'; end if;
  insert into predictions (team_id, week_id, couple_id, predicted_score) values (me, p_week, p_couple, p_score)
  on conflict (team_id, week_id) do update set couple_id = excluded.couple_id, predicted_score = excluded.predicted_score, updated_at = now();
end $$;

update leagues set settings = settings || '{"elim_call_points": 10, "elim_call_requires_score": true}'::jsonb;
alter table leagues alter column settings set default '{"elimination_multiplier": 0.5, "snipes_per_season": 1, "elim_call_points": 10, "elim_call_requires_score": true}'::jsonb;

create or replace function league_totals(p_league uuid, p_through_week int default 999)
returns table (team_id uuid, total numeric, weekly_wins int)
language sql stable set search_path = public as $$
  with lg as (select settings from leagues where id = p_league),
  wk as (select id, number from weeks where number <= p_through_week),
  pick_pts as (
    select pp.team_id, pp.week_id, sum(pp.points) as pts
    from league_pick_points(p_league) pp join wk on wk.id = pp.week_id
    group by pp.team_id, pp.week_id
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
  week_pts as (
    select team_id, week_id, sum(pts) as pts from (select * from pick_pts union all select * from call_pts) u group by team_id, week_id
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
alter publication supabase_realtime add table predictions;
