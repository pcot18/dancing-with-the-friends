import { createClient } from '@supabase/supabase-js'

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase.config.js'

const url = import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY
export const supabase = url && key ? createClient(url, key) : null

import { WEEKS } from '../data/cast.js'
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data }
const DOUBLE_FEATURE_FROM = 8   // week number the Double Feature starts (Last Rites was week 7 only)
let weeksCache = []

export const supabaseApi = {
  isDemo: false,
  now: () => new Date(),

  auth: {
    async getUser() { const { data } = await supabase.auth.getUser(); return data.user },
    // Email + password. If the account doesn't exist yet, it's created on the spot (auto-confirm is on).
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error) return data
      if (/invalid login credentials/i.test(error.message)) {
        const r = await supabase.auth.signUp({ email, password })
        if (r.error) throw new Error(r.error.message)
        if (!r.data.session) throw new Error('Account created, but email confirmation is on in Supabase. Turn it off (Auth → Providers → Email → Confirm email) and try again.')
        return r.data
      }
      throw new Error(error.message)
    },
    async signOut() { await supabase.auth.signOut() },
    async updatePassword(password) { return ok(await supabase.auth.updateUser({ password })) },
    async updateEmail(email) { return ok(await supabase.auth.updateUser({ email })) },
    onChange(cb) { const { data } = supabase.auth.onAuthStateChange((_e, s) => cb(s?.user ?? null)); return () => data.subscription.unsubscribe() },
  },

  async getProfile() {
    const user = await this.auth.getUser(); if (!user) return null
    return ok(await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle())
  },
  async updateProfile(display_name) {
    const user = await this.auth.getUser()
    return ok(await supabase.from('profiles').update({ display_name }).eq('user_id', user.id))
  },

  async loadSeason() {
    const season = ok(await supabase.from('seasons').select('*').eq('is_current', true).order('id', { ascending: false }).limit(1).maybeSingle())
    const [couples, weeks, scores] = await Promise.all([
      ok(await supabase.from('couples').select('*').eq('season_id', season.id).order('id')),
      ok(await supabase.from('weeks').select('*').eq('season_id', season.id).order('number')),
      ok(await supabase.from('scores').select('*')),
    ])
    // a week still titled 'Week N' in the DB takes its name from src/data/cast.js (themes land in code first)
    for (const w of weeks) { const local = WEEKS.find(x => x.number === w.number); if (local && /^Week \d+$/.test(w.title || '')) w.title = local.title }
    weeksCache = weeks
    return { season, couples, weeks, scores }
  },

  async loadMyLeagues() { return ok(await supabase.from('leagues').select('*').order('created_at')) },

  async loadLeague(leagueId) {
    const user = await this.auth.getUser()
    const league = ok(await supabase.from('leagues').select('*').eq('id', leagueId).single())
    const teams = ok(await supabase.from('teams').select('*').eq('league_id', leagueId).order('created_at'))
    const teamIds = teams.map(t => t.id)
    const [members, profiles, picks, powerPlays, drafts, predictions, gauntlet, ritesRows, dfRows] = await Promise.all([
      ok(await supabase.from('team_members').select('*').in('team_id', teamIds)),
      ok(await supabase.from('profiles').select('*')),
      ok(await supabase.from('picks').select('*').in('team_id', teamIds)),
      ok(await supabase.from('power_plays').select('*').in('team_id', teamIds)),
      ok(await supabase.from('drafts').select('*').eq('league_id', leagueId)),
      ok(await supabase.from('predictions').select('*').in('team_id', teamIds)),
      ok(await supabase.from('gauntlet').select('*').in('team_id', teamIds)),
      ok(await supabase.from('last_rites').select('*').in('team_id', teamIds)),
      supabase.from('double_feature').select('*').in('team_id', teamIds).then(r => r.error ? null : r.data),   // null until migration 0010 is applied
    ])
    // Double Feature fallback (migration 0010 not applied yet): week-8+ picks are parked in last_rites as
    // {high_id: victim 1, low_id: victim 2}. Pull them out so they're never scored as Last Rites.
    const weekNums = Object.fromEntries(weeksCache.map(w => [w.id, w.number]))
    const parked = ritesRows.filter(r => (weekNums[r.week_id] ?? r.week_id) >= DOUBLE_FEATURE_FROM)   // week ids equal week numbers in this seed
    const lastRites = ritesRows.filter(r => !parked.includes(r))
    const doubleFeature = dfRows ?? parked.map(r => ({ team_id: r.team_id, week_id: r.week_id, out_ids: [r.high_id, r.low_id], updated_at: r.updated_at }))
    const nameOf = Object.fromEntries(profiles.map(p => [p.user_id, p.display_name]))
    const membersNamed = members.map(m => ({ ...m, display_name: nameOf[m.user_id] || 'friend' }))
    const myTeam = teams.find(t => members.some(m => m.team_id === t.id && m.user_id === user.id)) || null
    return { league, teams, members: membersNamed, picks, powerPlays, drafts, predictions, gauntlet, lastRites, doubleFeature, myTeam, isCommissioner: league.commissioner === user.id }
  },

  // --- live draft ---
  async startDraft(league_id, week_id) { return ok(await supabase.rpc('start_draft', { p_league: league_id, p_week: week_id })) },
  async makePick(league_id, week_id, couple_id) { return ok(await supabase.rpc('make_pick', { p_league: league_id, p_week: week_id, p_couple: couple_id })) },
  async autoPick(league_id, week_id) { return ok(await supabase.rpc('make_pick', { p_league: league_id, p_week: week_id, p_couple: null })) },
  async makeCall(league_id, week_id, couple_id, score) { return ok(await supabase.rpc('make_call', { p_league: league_id, p_week: week_id, p_couple: couple_id, p_score: score })) },
  async makeDoubleFeature(league_id, week_id, ids) {
    const r = await supabase.rpc('make_double_feature', { p_league: league_id, p_week: week_id, p_out: ids })
    if (r.error && /make_double_feature/.test(r.error.message)) {   // 0010 not applied: park it in last_rites (see loadLeague)
      return ok(await supabase.rpc('make_last_rites', { p_league: league_id, p_week: week_id, p_high: ids[0], p_low: ids[1], p_out: ids[0], p_cries: false }))
    }
    return ok(r)
  },
  async makeLastRites(league_id, week_id, a) { return ok(await supabase.rpc('make_last_rites', { p_league: league_id, p_week: week_id, p_high: a.high, p_low: a.low, p_out: a.out, p_cries: a.cry })) },
  async setJudgeCried(week_id, v) { return ok(await supabase.from('weeks').update({ judge_cried: v }).eq('id', week_id)) },
  async makeGauntlet(league_id, week_id, bottom, out) { return ok(await supabase.rpc('make_gauntlet', { p_league: league_id, p_week: week_id, p_bottom: bottom, p_out: out })) },
  async setBottomThree(week_id, ids, points = null) { return ok(await supabase.from('weeks').update({ bottom_three: ids, bottom_points: points }).eq('id', week_id)) },
  async resetDraft(league_id, week_id) { return ok(await supabase.rpc('reset_draft', { p_league: league_id, p_week: week_id })) },
  /** Fires cb whenever drafts/picks/power_plays change for this league. Returns unsubscribe. */
  subscribe(league_id, cb) {
    const ch = supabase.channel(`league-${league_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drafts', filter: `league_id=eq.${league_id}` }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'power_plays' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gauntlet' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'last_rites' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'double_feature' }, cb)
      .subscribe()
    const poll = setInterval(cb, 2500)   // belt and braces: realtime can drop on phones (and on brand-new projects)
    return () => { clearInterval(poll); supabase.removeChannel(ch) }
  },
  async updateTeam(teamId, patch) { return ok(await supabase.from('teams').update(patch).eq('id', teamId)) },
  async useSnipe(week_id, target_team, give, take) { return ok(await supabase.rpc('use_snipe', { p_week: week_id, p_target_team: target_team, p_give: give, p_take: take })) },

  async saveScores(week, rows, eliminatedIds) {
    ok(await supabase.from('scores').upsert(rows.map(r => ({ ...r, week_id: week.id }))))
    // mark eliminations on the couples table (clears any that were un-checked for this week)
    ok(await supabase.from('couples').update({ eliminated_week: null }).eq('eliminated_week', week.number))
    if (eliminatedIds.length) ok(await supabase.from('couples').update({ eliminated_week: week.number }).in('id', eliminatedIds))
  },

  async createLeague(name, teamName, emoji) { return ok(await supabase.rpc('create_league', { p_name: name, p_team_name: teamName, p_emoji: emoji })) },
  async teamsForCode(code) { return ok(await supabase.rpc('teams_for_code', { p_code: code })) },
  async joinLeague(code, teamId, teamName, emoji) { return ok(await supabase.rpc('join_league', { p_code: code, p_team_id: teamId, p_team_name: teamName, p_emoji: emoji })) },
}
