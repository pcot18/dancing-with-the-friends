-- The dance-off: draft order is drawn at random every week, and the room shows a
-- 10-second scramble/reveal before the first clock starts. reveal_seconds is baked into
-- the first pick's deadline so nobody loses time to the show.
alter table drafts add column if not exists reveal_seconds int default 10;

create or replace function start_draft(p_league uuid, p_week int) returns void
language plpgsql security definer set search_path = public as $$
declare
  w weeks%rowtype; n int; alive int; ord uuid[]; roster int; crunch boolean; mode text;
begin
  select * into w from weeks where id = p_week;
  if not exists (select 1 from leagues where id = p_league and commissioner = auth.uid())
     and not (is_league_member(p_league) and now() >= w.draft_opens_at)
    then raise exception 'The commissioner opens the room (or anyone, once it is draft time)'; end if;
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
