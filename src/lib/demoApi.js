// In-memory backend with a plausible mid-season snapshot. No network, no login.
// Real season state (weeks 1–2 scored, two couples gone), pretend it's tonight 7:32pm ET: the
// draft room just opened and you're on the clock. The other teams are bots (one "isn't here").
import { SEASON, WEEKS, COUPLES, SCORES, weekLocks } from '../data/cast.js'
import { DEFAULT_SETTINGS, draftOrder, rosterSize, isCrunch, computeStandings, drafterAt, totalPicks } from './scoring.js'

const DEMO_BASE = new Date('2026-09-22T23:32:00Z').getTime()
const LOADED = Date.now()
const nowMs = () => DEMO_BASE + (Date.now() - LOADED)
const NOW = new Date(DEMO_BASE)
const ME = 'demo-user-paddy'

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }

const state = {
  season: { ...SEASON, winner_couple_id: null, is_current: true },
  couples: COUPLES.map(c => ({ ...c, season_id: SEASON.id, eliminated_week: c.eliminated_week ?? null })),
  weeks: WEEKS.map(w => ({ id: w.number, season_id: SEASON.id, number: w.number, title: w.title, judge_count: 3, ...weekLocks(w) })),
  scores: SCORES.map(x => ({ week_id: x.week, couple_id: x.couple, raw_total: x.total, max_possible: 30, eliminated: !!x.eliminated })),
  league: { id: 'demo-league', season_id: SEASON.id, name: 'Tuesday Night Ballroom Crimes', invite_code: 'SEQUIN', commissioner: ME, settings: { ...DEFAULT_SETTINGS } },
  teams: [
    { id: 't1', league_id: 'demo-league', name: 'The Paso Dobros', emoji: '🕺', draft_seed: 3 },
    { id: 't2', league_id: 'demo-league', name: 'Lift Violators', emoji: '🚨', draft_seed: 1 },
    { id: 't3', league_id: 'demo-league', name: 'Rhythm & Booze', emoji: '🍸', draft_seed: 4 },
    { id: 't4', league_id: 'demo-league', name: 'Mirrorball Mafia', emoji: '🪩', draft_seed: 2 },
  ],
  members: [
    { team_id: 't1', user_id: ME, display_name: 'paddy' }, { team_id: 't1', user_id: 'u2', display_name: 'the wife' },
    { team_id: 't2', user_id: 'u3', display_name: 'dan' }, { team_id: 't2', user_id: 'u4', display_name: 'lauren' },
    { team_id: 't3', user_id: 'u5', display_name: 'mike' }, { team_id: 't3', user_id: 'u6', display_name: 'jess' },
    { team_id: 't4', user_id: 'u7', display_name: 'kev' }, { team_id: 't4', user_id: 'u8', display_name: 'sam' },
  ],
  drafts: [],
  picks: [],
  powerPlays: [],
}
const listeners = new Set()
const emit = () => listeners.forEach(cb => { try { cb() } catch {} })

const standingsInput = () => ({ season: state.season, league: state.league, teams: state.teams, weeks: state.weeks, scores: state.scores, picks: state.picks, powerPlays: state.powerPlays, couples: state.couples })
const alive = () => state.couples.filter(c => c.eliminated_week == null).map(c => c.id)
const takenIn = (weekId) => new Set(state.picks.filter(p => p.week_id === weekId).map(p => p.couple_id))

function openDraft(week) {
  const order = draftOrder({ week, weeks: state.weeks, teams: state.teams, standingsInput: standingsInput() }).map(t => t.id)
  const a = alive(); const crunch = isCrunch(a.length, state.teams.length)
  const d = { league_id: state.league.id, week_id: week.id, status: 'live', order_ids: order, roster: crunch ? 1 : rosterSize(a.length, state.teams.length), crunch,
    current_index: 0, pick_seconds: 60, pick_deadline_at: new Date(nowMs() + 60000).toISOString(), started_at: new Date(nowMs()).toISOString(), finished_at: null }
  state.drafts = state.drafts.filter(x => x.week_id !== week.id); state.drafts.push(d)
  state.picks = state.picks.filter(p => p.week_id !== week.id)
  return d
}
function applyPick(d, coupleId, auto) {
  const team = drafterAt(d.order_ids, d.current_index, d.crunch)
  state.picks.push({ team_id: team, week_id: d.week_id, couple_id: coupleId, pick_number: d.current_index + 1, shared: d.crunch, sniped: false, auto })
  d.current_index += 1
  if (d.current_index >= totalPicks(d)) { d.status = 'done'; d.finished_at = new Date(nowMs()).toISOString(); d.pick_deadline_at = null }
  else d.pick_deadline_at = new Date(nowMs() + d.pick_seconds * 1000).toISOString()
}
function randomAvailable(d) {
  const pool = alive().filter(id => d.crunch || !takenIn(d.week_id).has(id))
  return pool[Math.floor(Math.random() * pool.length)]
}
// bots draft by form with some noise; that's how "present" friends behave
function botChoice(d, seed) {
  const r = rng(seed)
  const taken = takenIn(d.week_id)
  const pool = state.couples.filter(c => c.eliminated_week == null && (d.crunch || !taken.has(c.id)))
  return pool.map(c => ({ c, k: (c.floor + c.ceiling) / 2 + (r() - 0.5) * 10 })).sort((a, b) => b.k - a.k)[0].c.id
}

// --- tonight: the room is open, you're on the clock ------------------------------
const ABSENT = 't3'   // Rhythm & Booze "isn't here": their picks go to the 60s timer
const LIVE_WEEK = state.weeks.find(w => w.number === 3)
openDraft(LIVE_WEEK)
let botTimer = null
function scheduleBots() {
  clearTimeout(botTimer)
  const d = state.drafts.find(x => x.week_id === LIVE_WEEK.id)
  if (!d || d.status !== 'live') return
  const onClock = drafterAt(d.order_ids, d.current_index, d.crunch)
  if (onClock === 't1' || onClock === ABSENT) return   // you, or the empty chair
  botTimer = setTimeout(() => { applyPick(d, botChoice(d, Date.now()), false); emit(); scheduleBots() }, 2500 + Math.random() * 4000)
}
scheduleBots()

// --- api ----------------------------------------------------------------------
const clone = (x) => JSON.parse(JSON.stringify(x))
const wait = (ms = 120) => new Promise(r => setTimeout(r, ms))
let authListeners = []

export const demoApi = {
  isDemo: true,
  now: () => new Date(nowMs()),
  auth: {
    async getUser() { return { id: ME, email: 'paddy@example.com' } },
    async signIn() { return {} },
    async signOut() {},
    async updatePassword() {},
    async updateEmail() {},
    onChange(cb) { authListeners.push(cb); return () => { authListeners = authListeners.filter(f => f !== cb) } },
  },
  async getProfile() { return { user_id: ME, display_name: 'paddy', is_admin: true } },
  async updateProfile(display_name) { state.members.find(m => m.user_id === ME).display_name = display_name },
  async loadSeason() { await wait(); return clone({ season: state.season, couples: state.couples, weeks: state.weeks, scores: state.scores }) },
  async loadMyLeagues() { return clone([state.league]) },
  async loadLeague() {
    await wait()
    return clone({ league: state.league, teams: state.teams, members: state.members, picks: state.picks, powerPlays: state.powerPlays, drafts: state.drafts, myTeam: state.teams[0], isCommissioner: true })
  },
  async startDraft(_l, week_id) { openDraft(state.weeks.find(w => w.id === week_id)); emit(); scheduleBots() },
  async makePick(_l, week_id, couple_id) {
    const d = state.drafts.find(x => x.week_id === week_id)
    if (!d || d.status !== 'live') throw new Error('No live draft')
    if (drafterAt(d.order_ids, d.current_index, d.crunch) !== 't1') throw new Error('You are not on the clock')
    if (!d.crunch && takenIn(week_id).has(couple_id)) throw new Error('Already taken')
    applyPick(d, couple_id, false); emit(); scheduleBots()
  },
  async autoPick(_l, week_id) {
    const d = state.drafts.find(x => x.week_id === week_id)
    if (!d || d.status !== 'live') return
    if (nowMs() < new Date(d.pick_deadline_at).getTime()) throw new Error('Clock has not run out yet')
    applyPick(d, randomAvailable(d), true); emit(); scheduleBots()
  },
  async resetDraft(_l, week_id) { openDraft(state.weeks.find(w => w.id === week_id)); emit(); scheduleBots() },
  subscribe(_l, cb) { listeners.add(cb); return () => listeners.delete(cb) },
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
  async saveScores(week, rows, eliminatedIds) {
    await wait()
    state.scores = state.scores.filter(s => s.week_id !== week.id)
    for (const r of rows) state.scores.push({ ...r, week_id: week.id })
    for (const c of state.couples) if (c.eliminated_week === week.number) c.eliminated_week = null
    for (const id of eliminatedIds) state.couples.find(c => c.id === id).eliminated_week = week.number
  },
  async createLeague() { return state.league.id },
  async teamsForCode() { return state.teams.map(t => ({ id: t.id, name: t.name, emoji: t.emoji, league_name: state.league.name, member_count: 2 })) },
  async joinLeague() { return state.league.id },
}

// handy for debugging in the console
if (typeof window !== 'undefined') window.__dwtf = { state, computeStandings }
