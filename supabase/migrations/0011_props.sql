-- 0011: generic weekly prop questions ("props") from Disney Night (week 9) on, plus a hard lock time.
-- The questions themselves live in code (PROPS in src/data/cast.js); each team's answers are a JSON blob,
-- and the commissioner's rulings for the week (team-dance scores, individual scores, yes/no calls) go in
-- weeks.extra. Scored in the app (src/lib/scoring.js); league_totals() does not include props.

alter table weeks add column if not exists extra jsonb not null default '{}'::jsonb;
alter table weeks add column if not exists picks_lock_at timestamptz;

create table if not exists props (
  team_id     uuid references teams on delete cascade,
  week_id     int references weeks on delete cascade,
  answers     jsonb not null,
  updated_at  timestamptz default now(),
  primary key (team_id, week_id)
);
alter table props enable row level security;
create policy "read props" on props for select to authenticated
  using (is_team_member(team_id) or (
    is_league_member((select league_id from teams where id = team_id))
    and exists (select 1 from scores s where s.week_id = props.week_id)));
alter publication supabase_realtime add table props;

create or replace function make_props(p_league uuid, p_week int, p_answers jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid; lock_at timestamptz;
begin
  me := my_team_in_league(p_league);
  if me is null then raise exception 'You are not on a team in this league'; end if;
  if not exists (select 1 from drafts where league_id = p_league and week_id = p_week and status = 'done') then raise exception 'Props open after the draft'; end if;
  if exists (select 1 from scores where week_id = p_week) then raise exception 'Too late — scores are in'; end if;
  select picks_lock_at into lock_at from weeks where id = p_week;
  if lock_at is not null and now() >= lock_at then raise exception 'Locked at 8:05 — no more changes'; end if;
  insert into props (team_id, week_id, answers) values (me, p_week, p_answers)
  on conflict (team_id, week_id) do update set answers = excluded.answers, updated_at = now();
end $$;
grant execute on function make_props(uuid, int, jsonb) to authenticated;

-- Disney Night: Monday Nov 2, 2026 (moved for election coverage); picks lock 8:05pm ET (EST, UTC-5)
update weeks set title = 'Disney Night', draft_opens_at = '2026-11-03 00:30:00+00', show_lock_at = '2026-11-03 01:00:00+00', picks_lock_at = '2026-11-03 01:05:00+00' where number = 9;
