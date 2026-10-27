-- 0010: Horror Movie Night "Double Feature" (week 8 on): two couples go home; each team names both.
-- Both right = double_feature_points (8), one right = double_feature_one (2). Replaces Last Rites (week 7 only).

create table if not exists double_feature (
  team_id     uuid references teams on delete cascade,
  week_id     int references weeks on delete cascade,
  out_ids     int[] not null,
  updated_at  timestamptz default now(),
  primary key (team_id, week_id)
);
alter table double_feature enable row level security;
create policy "read double_feature" on double_feature for select to authenticated
  using (is_team_member(team_id) or (
    is_league_member((select league_id from teams where id = team_id))
    and exists (select 1 from scores s where s.week_id = double_feature.week_id)));
alter publication supabase_realtime add table double_feature;

create or replace function make_double_feature(p_league uuid, p_week int, p_out int[])
returns void language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  me := my_team_in_league(p_league);
  if me is null then raise exception 'You are not on a team in this league'; end if;
  if not exists (select 1 from drafts where league_id = p_league and week_id = p_week and status = 'done') then raise exception 'The Double Feature opens after the draft'; end if;
  if exists (select 1 from scores where week_id = p_week) then raise exception 'Too late — scores are in'; end if;
  if array_length(p_out, 1) <> 2 or (select count(distinct x) from unnest(p_out) x) <> 2 then raise exception 'Pick exactly two different couples'; end if;
  if exists (select 1 from unnest(p_out) x where not exists (select 1 from couples c where c.id = x and c.eliminated_week is null)) then raise exception 'One of those couples is already gone'; end if;
  insert into double_feature (team_id, week_id, out_ids) values (me, p_week, p_out)
  on conflict (team_id, week_id) do update set out_ids = excluded.out_ids, updated_at = now();
end $$;
grant execute on function make_double_feature(uuid, int, int[]) to authenticated;

update leagues set settings = settings || '{"double_feature_points": 8, "double_feature_one": 2}'::jsonb;
update weeks set title = 'Horror Movie Night' where number = 8;

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
  -- Last Rites: normalized score per couple per week, with the night's high and low
  night as (
    select s.week_id, s.couple_id, s.raw_total * 3.0 / w.judge_count as n, s.eliminated
    from scores s join weeks w on w.id = s.week_id
  ),
  rites_pts as (
    select r.team_id, r.week_id, coalesce((lg.settings->>'last_rites_points')::numeric, 4) * (
        (case when (select n from night where week_id = r.week_id and couple_id = r.high_id) = (select max(n) from night where week_id = r.week_id) then 1 else 0 end)
      + (case when (select n from night where week_id = r.week_id and couple_id = r.low_id)  = (select min(n) from night where week_id = r.week_id) then 1 else 0 end)
      + (case when exists (select 1 from night where week_id = r.week_id and couple_id = r.out_id and eliminated)
                 or not exists (select 1 from night where week_id = r.week_id and eliminated) then 1 else 0 end)  -- nobody went home: everyone was right
      + (case when w.judge_cried is not null and w.judge_cried = r.judge_cries then 1 else 0 end)
    ) as pts
    from last_rites r join teams t on t.id = r.team_id and t.league_id = p_league
    join weeks w on w.id = r.week_id join wk on wk.id = r.week_id cross join lg
    where exists (select 1 from scores s where s.week_id = r.week_id)
  ),
  -- Double Feature: name the two couples going home. Both right = double_feature_points, one = double_feature_one.
  double_pts as (
    select d.team_id, d.week_id,
      case (select count(*) from unnest(d.out_ids) x join scores s on s.week_id = d.week_id and s.couple_id = x and s.eliminated)
        when 2 then coalesce((lg.settings->>'double_feature_points')::numeric, 8)
        when 1 then coalesce((lg.settings->>'double_feature_one')::numeric, 2)
        else 0 end as pts
    from double_feature d join teams t on t.id = d.team_id and t.league_id = p_league
    join wk on wk.id = d.week_id cross join lg
    where exists (select 1 from scores s where s.week_id = d.week_id)
  ),
  week_pts as (
    select team_id, week_id, sum(pts) as pts from (
      select * from pick_pts union all select * from call_pts union all select * from bottom_pts
      union all select * from vote_pts union all select * from rites_pts union all select * from double_pts
    ) u group by team_id, week_id
  ),
  wins as (
    select team_id, count(*) as n from (
      select team_id, week_id, pts, rank() over (partition by week_id order by pts desc) as rk from week_pts
    ) x where rk = 1 group by team_id
  )
  select t.id,
    coalesce((select sum(pts) from week_pts where team_id = t.id), 0) as total,
    coalesce((select n from wins where team_id = t.id), 0)::int as weekly_wins
  from teams t where t.league_id = p_league;
$$;
