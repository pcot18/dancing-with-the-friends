import { createClient } from '@supabase/supabase-js'

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase.config.js'

const url = import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY
export const supabase = url && key ? createClient(url, key) : null

const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data }

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
    return { season, couples, weeks, scores }
  },

  async loadMyLeagues() { return ok(await supabase.from('leagues').select('*').order('created_at')) },

  async loadLeague(leagueId) {
    const user = await this.auth.getUser()
    const league = ok(await supabase.from('leagues').select('*').eq('id', leagueId).single())
    const teams = ok(await supabase.from('teams').select('*').eq('league_id', leagueId).order('created_at'))
    const teamIds = teams.map(t => t.id)
    const [members, profiles, picks, powerPlays, drafts] = await Promise.all([
      ok(await supabase.from('team_members').select('*').in('team_id', teamIds)),
      ok(await supabase.from('profiles').select('*')),
      ok(await supabase.from('picks').select('*').in('team_id', teamIds)),
      ok(await supabase.from('power_plays').select('*').in('team_id', teamIds)),
      ok(await supabase.from('drafts').select('*').eq('league_id', leagueId)),
    ])
    const nameOf = Object.fromEntries(profiles.map(p => [p.user_id, p.display_name]))
    const membersNamed = members.map(m => ({ ...m, display_name: nameOf[m.user_id] || 'friend' }))
    const myTeam = teams.find(t => members.some(m => m.team_id === t.id && m.user_id === user.id)) || null
    return { league, teams, members: membersNamed, picks, powerPlays, drafts, myTeam, isCommissioner: league.commissioner === user.id }
  },

  // --- live draft ---
  async startDraft(league_id, week_id) { return ok(await supabase.rpc('start_draft', { p_league: league_id, p_week: week_id })) },
  async makePick(league_id, week_id, couple_id) { return ok(await supabase.rpc('make_pick', { p_league: league_id, p_week: week_id, p_couple: couple_id })) },
  async autoPick(league_id, week_id) { return ok(await supabase.rpc('make_pick', { p_league: league_id, p_week: week_id, p_couple: null })) },
  async resetDraft(league_id, week_id) { return ok(await supabase.rpc('reset_draft', { p_league: league_id, p_week: week_id })) },
  /** Fires cb whenever drafts/picks/power_plays change for this league. Returns unsubscribe. */
  subscribe(league_id, cb) {
    const ch = supabase.channel(`league-${league_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drafts', filter: `league_id=eq.${league_id}` }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'power_plays' }, cb)
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
  async setWinner(seasonId, coupleId) { return ok(await supabase.from('seasons').update({ winner_couple_id: coupleId }).eq('id', seasonId)) },

  async createLeague(name, teamName, emoji) { return ok(await supabase.rpc('create_league', { p_name: name, p_team_name: teamName, p_emoji: emoji })) },
  async teamsForCode(code) { return ok(await supabase.rpc('teams_for_code', { p_code: code })) },
  async joinLeague(code, teamId, teamName, emoji) { return ok(await supabase.rpc('join_league', { p_code: code, p_team_id: teamId, p_team_name: teamName, p_emoji: emoji })) },
}
