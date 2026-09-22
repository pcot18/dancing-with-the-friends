-- Ride or Die is retired. Totals are picks only; tiebreaker is weekly wins.
create or replace function league_totals(p_league uuid, p_through_week int default 999)
returns table (team_id uuid, total numeric, weekly_wins int)
language sql stable set search_path = public as $$
  with wk as (select id, number from weeks where number <= p_through_week),
  week_pts as (
    select pp.team_id, pp.week_id, sum(pp.points) as pts
    from league_pick_points(p_league) pp join wk on wk.id = pp.week_id
    group by pp.team_id, pp.week_id
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

update leagues set settings = settings - 'ride_or_die_weekly' - 'ride_or_die_winner';
alter table leagues alter column settings set default '{"elimination_multiplier": 0.5, "snipes_per_season": 1}'::jsonb;
-- Refresh the bios that mentioned it.
update couples set bio = replace(bio, ' Ride or Die grade: A.', '') where id = 11;
update couples set red_flag = replace(red_flag, 'As a Ride or Die she''s sneaky great.', 'Draft her the week the theme is anything with a wind machine.') where id = 12;
