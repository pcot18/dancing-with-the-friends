-- 0008: the "bottom three" the show announces can be shorter than three (Super Bowl Night showed
-- only two couples in the final spotlight). A team hits when every announced couple is among its
-- three picks; the commissioner can set a per-week payout (weeks.bottom_points) instead of the
-- league default.
alter table weeks add column if not exists bottom_points numeric;

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
    select g.team_id, g.week_id, coalesce(w.bottom_points, (lg.settings->>'gauntlet_bottom_points')::numeric) as pts
    from gauntlet g join teams t on t.id = g.team_id and t.league_id = p_league
    join weeks w on w.id = g.week_id join wk on wk.id = g.week_id cross join lg
    where w.bottom_three is not null and array_length(w.bottom_three, 1) >= 1
      and w.bottom_three <@ g.bottom_ids
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
