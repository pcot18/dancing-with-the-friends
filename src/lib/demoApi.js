// In-memory backend with a plausible mid-season snapshot. No network, no login.
// Pretend it's Tuesday Oct 6, 2026, 10am ET: the week 4 draft has run, the show is tonight,
// and the trade window (snipes! flags!) is open.
import { SEASON, WEEKS, COUPLES, weekLocks } from '../data/cast.js'
import { DEFAULT_SETTINGS, previewDraft, draftOrder, rosterSize, isCrunch, computeStandings } from './scoring.js'

const NOW = new Date('2026-10-06T14:00:00Z')
const ME = 'demo-user-paddy'

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }

const state = {
  season: { ...SEASON, winner_couple_id: null, is_current: true },
  couples: COUPLES.map(c => ({ ...c, season_id: SEASON.id, eliminated_week: null })),
  weeks: WEEKS.map(w => ({ id: w.number, season_id: SEASON.id, number: w.number, title: w.title, judge_count: 3, resolved: false, ...weekLocks(w) })),
  scores: [],
  league: { id: 'demo-league', season_id: SEASON.id, name: 'Tuesday Night Ballroom Crimes', invite_code: 'SEQUIN', commissioner: ME, settings: { ...DEFAULT_SETTINGS } },
  teams: [
    { id: 't1', league_id: 'demo-league', name: 'The Paso Dobros', emoji: '🕺', ride_or_die: 6, draft_seed: 3 },
    { id: 't2', league_id: 'demo-league', name: 'Lift Violators', emoji: '🚨', ride_or_die: 11, draft_seed: 1 },
    { id: 't3', league_id: 'demo-league', name: 'Rhythm & Booze', emoji: '🍸', ride_or_die: 1, draft_seed: 4 },
    { id: 't4', league_id: 'demo-league', name: 'Mirrorball Mafia', emoji: '🪩', ride_or_die: 3, draft_seed: 2 },
  ],
  members: [
    { team_id: 't1', user_id: ME, display_name: 'paddy' }, { team_id: 't1', user_id: 'u2', display_name: 'the wife' },
    { team_id: 't2', user_id: 'u3', display_name: 'dan' }, { team_id: 't2', user_id: 'u4', display_name: 'lauren' },
    { team_id: 't3', user_id: 'u5', display_name: 'mike' }, { team_id: 't3', user_id: 'u6', display_name: 'jess' },
    { team_id: 't4', user_id: 'u7', display_name: 'kev' }, { team_id: 't4', user_id: 'u8', display_name: 'sam' },
  ],
  rankings: [],
  picks: [],
  powerPlays: [],
}

// --- simulate weeks 1–3 scored, week 4 drafted ---------------------------------
const rand = rng(35)
const teamIds = state.teams.map(t => t.id)
const eliminations = { 2: [16], 3: [15] }   // Giada goes week 2, Sarah Jane week 3

function fakeRanking(seed) {
  const r = rng(seed)
  return [...state.couples].map(c => ({ c, k: (c.floor + c.ceiling) / 2 + (r() - 0.5) * 8 })).sort((a, b) => b.k - a.k).map(x => x.c.id)
}
function fakeScore(c, week) {
  const spread = c.ceiling - c.floor
  const base = c.floor + spread * (0.35 + 0.08 * week.number) + (rand() - 0.5) * spread * 0.5
  const dances = week.number === 1 ? 2 : 1
  const perDance = Math.max(12, Math.min(30, Math.round(base)))
  return { raw_total: perDance * dances, max_possible: 30 * dances }
}

function runDraft(week) {
  const alive = state.couples.filter(c => c.eliminated_week == null).map(c => c.id)
  const teams = state.teams
  const order = draftOrder({ week, weeks: state.weeks, teams, standingsInput: { season: state.season, league: state.league, teams, weeks: state.weeks, scores: state.scores, picks: state.picks, powerPlays: state.powerPlays, couples: state.couples } })
  const rankings = Object.fromEntries(state.rankings.filter(r => r.week_id === week.id).map(r => [r.team_id, r.ordered_couple_ids]))
  const fallback = [...alive]
  state.picks = state.picks.filter(p => p.week_id !== week.id)
  if (isCrunch(alive.length, teams.length)) {
    for (const t of teams) {
      const choice = (rankings[t.id] || fallback).find(id => alive.includes(id))
      state.picks.push({ team_id: t.id, week_id: week.id, couple_id: choice, pick_number: 0, shared: true, sniped: false })
    }
  } else {
    const res = previewDraft({ order, rankings, alive, roster: rosterSize(alive.length, teams.length), fallbackOrder: fallback })
    let n = 0
    for (const t of order) for (const cid of res[t.id]) state.picks.push({ team_id: t.id, week_id: week.id, couple_id: cid, pick_number: ++n, shared: false, sniped: false })
  }
  week.resolved = true
}

for (const week of state.weeks.filter(w => w.number <= 4)) {
  teamIds.forEach((tid, i) => state.rankings.push({ team_id: tid, week_id: week.id, ordered_couple_ids: fakeRanking(week.number * 10 + i), updated_at: NOW.toISOString() }))
  runDraft(week)
  if (week.number <= 3) {
    const elim = eliminations[week.number] || []
    for (const c of state.couples.filter(c => c.eliminated_week == null)) {
      state.scores.push({ week_id: week.id, couple_id: c.id, ...fakeScore(c, week), eliminated: elim.includes(c.id) })
    }
    for (const id of elim) state.couples.find(c => c.id === id).eliminated_week = week.number
  }
}
// a couple of power plays already spent, for flavor
state.powerPlays.push({ id: 'pp1', team_id: 't2', week_id: 2, kind: 'lift', target_team_id: 't3', created_at: NOW.toISOString() })
{
  // t4 sniped t3 in week 3: swap the first pick of each
  const a = state.picks.find(p => p.week_id === 3 && p.team_id === 't4')
  const b = state.picks.find(p => p.week_id === 3 && p.team_id === 't3')
  const ac = a.couple_id; a.couple_id = b.couple_id; b.couple_id = ac; a.sniped = b.sniped = true
  state.powerPlays.push({ id: 'pp2', team_id: 't4', week_id: 3, kind: 'snipe', target_team_id: 't3', give_couple_id: b.couple_id, take_couple_id: a.couple_id, created_at: NOW.toISOString() })
}

// --- api ----------------------------------------------------------------------
const clone = (x) => JSON.parse(JSON.stringify(x))
const wait = (ms = 120) => new Promise(r => setTimeout(r, ms))
let authListeners = []

export const demoApi = {
  isDemo: true,
  now: () => new Date(NOW),
  auth: {
    async getUser() { return { id: ME, email: 'paddy@example.com' } },
    async signIn() { return {} },
    async signOut() {},
    onChange(cb) { authListeners.push(cb); return () => { authListeners = authListeners.filter(f => f !== cb) } },
  },
  async getProfile() { return { user_id: ME, display_name: 'paddy', is_admin: true } },
  async updateProfile() {},
  async loadSeason() { await wait(); return clone({ season: state.season, couples: state.couples, weeks: state.weeks, scores: state.scores }) },
  async loadMyLeagues() { return clone([state.league]) },
  async loadLeague() {
    await wait()
    return clone({ league: state.league, teams: state.teams, members: state.members, picks: state.picks, powerPlays: state.powerPlays, rankings: state.rankings, myTeam: state.teams[0], isCommissioner: true })
  },
  async saveRanking(team_id, week_id, ordered_couple_ids) {
    const r = state.rankings.find(r => r.team_id === team_id && r.week_id === week_id)
    if (r) Object.assign(r, { ordered_couple_ids, updated_at: NOW.toISOString() }); else state.rankings.push({ team_id, week_id, ordered_couple_ids, updated_at: NOW.toISOString() })
  },
  async updateTeam(teamId, patch) { Object.assign(state.teams.find(t => t.id === teamId), patch) },
  async useSnipe(week_id, target_team, give, take) {
    await wait()
    const me = state.teams[0]
    if (state.powerPlays.some(p => p.team_id === me.id && p.kind === 'snipe')) throw new Error('No snipes left this season')
    const a = state.picks.find(p => p.week_id === week_id && p.team_id === me.id && p.couple_id === give && !p.sniped)
    const b = state.picks.find(p => p.week_id === week_id && p.team_id === target_team && p.couple_id === take && !p.sniped)
    if (!a || !b) throw new Error('That couple is not available to snipe')
    a.team_id = target_team; a.sniped = true; b.team_id = me.id; b.sniped = true
    state.powerPlays.push({ id: 'pp' + Date.now(), team_id: me.id, week_id, kind: 'snipe', target_team_id: target_team, give_couple_id: give, take_couple_id: take, created_at: NOW.toISOString() })
  },
  async useLift(week_id, target_team) {
    await wait()
    const me = state.teams[0]
    if (state.powerPlays.some(p => p.team_id === me.id && p.kind === 'lift')) throw new Error('No illegal-lift flags left this season')
    state.powerPlays.push({ id: 'pp' + Date.now(), team_id: me.id, week_id, kind: 'lift', target_team_id: target_team, created_at: NOW.toISOString() })
  },
  async rerunDraft(week_id) { runDraft(state.weeks.find(w => w.id === week_id)); return 1 },
  async saveScores(week, rows, eliminatedIds) {
    await wait()
    state.scores = state.scores.filter(s => s.week_id !== week.id)
    for (const r of rows) state.scores.push({ ...r, week_id: week.id })
    for (const c of state.couples) if (c.eliminated_week === week.number) c.eliminated_week = null
    for (const id of eliminatedIds) state.couples.find(c => c.id === id).eliminated_week = week.number
  },
  async setWinner(_s, coupleId) { state.season.winner_couple_id = coupleId },
  async createLeague() { return state.league.id },
  async teamsForCode() { return state.teams.map(t => ({ id: t.id, name: t.name, emoji: t.emoji, league_name: state.league.name, member_count: 2 })) },
  async joinLeague() { return state.league.id },
}

// handy for debugging in the console
if (typeof window !== 'undefined') window.__dwtf = { state, computeStandings }
