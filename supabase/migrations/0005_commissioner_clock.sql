-- No fixed times. The commissioner starts the draft whenever; the snipe window stays open
-- until the week's scores are entered; snipes are revealed once scores are in.
create or replace function start_draft(p_league uuid, p_week int) returns void
language plpgsql security definer set search_path = public as $$
declare
  w weeks%rowtype; n int; alive int; ord uuid[]; roster int; crunch boolean; mode text;
begin
  select * into w from weeks where id = p_week;
  if not exists (select 1 from leagues where id = p_league and commissioner = auth.uid()) and not is_admin()
    then raise exception 'Only the commissioner can start the draft'; end if;
  if exists (select 1 from drafts where league_id = p_league and week_id = p_week) then raise exception 'Draft already started'; end if;
  if exists (select 1 from scores where week_id = p_week) then raise exception 'That week is already scored'; end if;

  select count(*) into n from teams where league_id = p_league;
  select count(*) into alive from couples where season_id = w.season_id and eliminated_week is null;
  if n = 0 or alive = 0 then raise exception 'Nothing to draft'; end if;

  select coalesce(settings->>'draft_order', 'random') into mode from leagues where id = p_league;
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
  values (p_league, p_week, ord, roster, crunch, 10, now() + interval '10 seconds' + interval '60 seconds');
end $$;

create or replace function use_snipe(p_week int, p_target_team uuid, p_give int, p_take int)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid; lg uuid; used int; allowed int;
begin
  select league_id into lg from teams where id = p_target_team;
  me := my_team_in_league(lg);
  if me is null then raise exception 'You are not on a team in this league'; end if;
  if me = p_target_team then raise exception 'You cannot snipe yourself, although we respect it'; end if;
  if not exists (select 1 from drafts where league_id = lg and week_id = p_week and status = 'done') then raise exception 'The draft is not finished yet'; end if;
  if exists (select 1 from scores where week_id = p_week) then raise exception 'Too late — this week is already scored'; end if;
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

drop policy if exists "read power plays" on power_plays;
create policy "read power plays" on power_plays for select to authenticated
  using (is_team_member(team_id) or (
    is_league_member((select league_id from teams where id = team_id))
    and exists (select 1 from scores s where s.week_id = power_plays.week_id)));
