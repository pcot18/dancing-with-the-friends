-- 0012: playoff drafts. In a playoff week each bracket matchup drafts against itself: the two teams in a
-- matchup snake-pick two couples each (X, Y, Y, X) from the full pool, and a couple may be taken once per
-- matchup (so both matchups can own the same couple; full points to each, no split).
-- leagues.settings: playoff_weeks int[] (JSON), playoff_groups [[team,team],[team,team]].

create or replace function playoff_group(p_league uuid, p_team uuid) returns uuid[]
language sql stable set search_path = public as $$
  select array_agg(x::uuid) from leagues l, jsonb_array_elements(l.settings->'playoff_groups') g, jsonb_array_elements_text(g) x
  where l.id = p_league and g ? p_team::text
$$;

create or replace function start_draft(p_league uuid, p_week int) returns void
language plpgsql security definer set search_path = public as $$
declare
  w weeks%rowtype; n int; alive int; ord uuid[]; roster int; crunch boolean; mode text; rev int; playoff boolean; g jsonb; a uuid; b uuid;
begin
  select * into w from weeks where id = p_week;
  if not exists (select 1 from leagues where id = p_league and commissioner = auth.uid()) and not is_admin()
    then raise exception 'Only the commissioner can start the draft'; end if;
  if exists (select 1 from drafts where league_id = p_league and week_id = p_week) then raise exception 'Draft already started'; end if;
  if exists (select 1 from scores where week_id = p_week) then raise exception 'That week is already scored'; end if;
  select count(*) into n from teams where league_id = p_league;
  select count(*) into alive from couples where season_id = w.season_id and eliminated_week is null;
  if n = 0 or alive = 0 then raise exception 'Nothing to draft'; end if;
  select coalesce(settings->>'draft_order', 'random'), coalesce((settings->>'reveal_seconds')::int, 10),
         coalesce(settings->'playoff_weeks' @> to_jsonb(w.number), false) and settings ? 'playoff_groups'
    into mode, rev, playoff from leagues where id = p_league;
  if playoff then
    -- each matchup: coin flip, then X Y Y X; the order array lists every pick explicitly (roster 1 ⇒ one pass)
    ord := '{}';
    for g in select * from jsonb_array_elements((select settings->'playoff_groups' from leagues where id = p_league)) loop
      if random() < 0.5 then a := (g->>0)::uuid; b := (g->>1)::uuid; else a := (g->>1)::uuid; b := (g->>0)::uuid; end if;
      ord := ord || a || b || b || a;
    end loop;
    roster := 1; crunch := false;
  else
    if mode = 'reverse_standings' and exists (select 1 from picks p join teams t on t.id = p.team_id where t.league_id = p_league) then
      select array_agg(t.id order by lt.total asc, lt.weekly_wins asc, random()) into ord
      from teams t join league_totals(p_league, w.number - 1) lt on lt.team_id = t.id where t.league_id = p_league;
    else
      select array_agg(id order by random()) into ord from teams where league_id = p_league;
    end if;
    crunch := alive < n;
    roster := case when crunch then 1 else alive / n end;
  end if;
  delete from picks where week_id = p_week and team_id in (select id from teams where league_id = p_league);
  insert into drafts (league_id, week_id, order_ids, roster, crunch, reveal_seconds, pick_deadline_at)
  values (p_league, p_week, ord, roster, crunch, rev, now() + make_interval(secs => rev) + interval '60 seconds');
end $$;

create or replace function make_pick(p_league uuid, p_week int, p_couple int default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  d drafts%rowtype; w weeks%rowtype; on_clock uuid; n int; total int; chosen int; is_auto boolean := false; grp uuid[];
begin
  select * into d from drafts where league_id = p_league and week_id = p_week for update;
  if d is null or d.status <> 'live' then raise exception 'No live draft'; end if;
  select * into w from weeks where id = p_week;
  n := array_length(d.order_ids, 1);
  total := case when d.crunch then n else d.roster * n end;
  on_clock := drafter_at(d.order_ids, d.current_index, d.crunch);
  grp := playoff_group(p_league, on_clock);   -- null outside the playoffs: "taken" means taken by anyone

  if p_couple is null then
    if now() < d.pick_deadline_at then raise exception 'Clock has not run out yet'; end if;
    if not is_league_member(p_league) then raise exception 'Not your league'; end if;
    select id into chosen from couples
    where season_id = w.season_id and eliminated_week is null
      and (d.crunch or id not in (select couple_id from picks p join teams t on t.id = p.team_id
                                  where t.league_id = p_league and p.week_id = p_week and (grp is null or p.team_id = any(grp))))
    order by random() limit 1;
    is_auto := true;
  else
    if not is_team_member(on_clock) then raise exception 'You are not on the clock'; end if;
    if not exists (select 1 from couples where id = p_couple and season_id = w.season_id and eliminated_week is null)
      then raise exception 'That couple is not in the pool'; end if;
    if not d.crunch and exists (select 1 from picks p join teams t on t.id = p.team_id
                                where t.league_id = p_league and p.week_id = p_week and p.couple_id = p_couple and (grp is null or p.team_id = any(grp)))
      then raise exception 'Already taken in your matchup'; end if;
    chosen := p_couple;
  end if;

  insert into picks (team_id, week_id, couple_id, pick_number, shared, auto)
  values (on_clock, p_week, chosen, d.current_index + 1, d.crunch, is_auto);

  if d.current_index + 1 >= total then
    update drafts set status = 'done', current_index = d.current_index + 1, finished_at = now(), pick_deadline_at = null
    where league_id = p_league and week_id = p_week;
  else
    update drafts set current_index = d.current_index + 1, pick_deadline_at = now() + make_interval(secs => d.pick_seconds)
    where league_id = p_league and week_id = p_week;
  end if;
  return chosen;
end $$;

-- Season 35 playoffs: semis 1v4 (Bruno's vs Theatre Kids), 2v3 (Jams vs Bird)
update leagues set settings = settings || jsonb_build_object(
  'playoff_weeks', '[11]'::jsonb,
  'playoff_groups', '[["41b88890-0840-4fb8-b807-366e0516d567","acfacbf3-13ad-4713-ab12-a6d74c468e7b"],["cf3ffbeb-f741-4b3e-b04f-4c7c7672a1d4","9755e61b-cb06-430e-978a-27c0ef47b375"]]'::jsonb)
where invite_code = 'E4D5A5';
