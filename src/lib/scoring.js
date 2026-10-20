// Scoring engine. Mirrors league_pick_points / league_totals in the SQL schema.
// Pure functions over plain data so demo mode and the live app share it.

export const DEFAULT_SETTINGS = {
  elimination_multiplier: 0.5,
  snipes_per_season: 1,
  elim_call_points: 10,
  elim_call_requires_score: true,
  gauntlet_bottom_points: 10,
  gauntlet_stake: 10,
  gauntlet_target_couple: 11,
  last_rites_points: 4,
}

export function normalizeScore(score, week) {
  // Scale to a 3-judge, 30-per-dance basis so 4-judge nights stay comparable.
  return (Number(score.raw_total) * 3) / (week.judge_count || 3)
}

/**
 * @returns {{ teams: Record<teamId, TeamLine>, ranked: TeamLine[], weeksScored: number[] }}
 * TeamLine = { team, total, weeklyWins, weeks: { [weekId]: WeekLine } }
 * WeekLine = { points, picks: [{couple, raw, max, adj, shared, owners, eliminated, sniped}], won }
 */
export function computeStandings({ season, league, teams, weeks, scores, picks, powerPlays, couples, predictions = [], gauntlet = [], lastRites = [] }) {
  const settings = { ...DEFAULT_SETTINGS, ...(league?.settings || {}) }
  const coupleById = Object.fromEntries(couples.map(c => [c.id, c]))
  const weekById = Object.fromEntries(weeks.map(w => [w.id, w]))
  const scoreKey = (w, c) => `${w}:${c}`
  const scoreMap = Object.fromEntries(scores.map(s => [scoreKey(s.week_id, s.couple_id), s]))
  // Weeks that count for this league: scored AND the league drafted them (a league that joins mid-season
  // doesn't earn Ride or Die points, or weekly wins, for weeks it wasn't playing).
  const drafted = new Set(picks.map(p => p.week_id))
  const weeksScored = [...new Set(scores.map(s => s.week_id))].filter(w => drafted.has(w)).sort((a, b) => weekById[a].number - weekById[b].number)

  // owners per (week, couple) for crunch-time splits
  const ownerCount = {}
  for (const p of picks) {
    const k = scoreKey(p.week_id, p.couple_id)
    ownerCount[k] = (ownerCount[k] || 0) + 1
  }

  const lines = {}
  for (const t of teams) {
    lines[t.id] = { team: t, total: 0, weeklyWins: 0, weeks: {} }
    for (const w of weeks) lines[t.id].weeks[w.id] = { points: 0, picks: [], call: null, gauntlet: null, won: false }
  }

  for (const p of picks) {
    const line = lines[p.team_id]; if (!line) continue
    const week = weekById[p.week_id]; if (!week) continue
    const s = scoreMap[scoreKey(p.week_id, p.couple_id)]
    const owners = p.shared ? ownerCount[scoreKey(p.week_id, p.couple_id)] : 1
    const entry = { couple: coupleById[p.couple_id], shared: p.shared, owners, sniped: p.sniped, pick_number: p.pick_number,
      raw: s ? Number(s.raw_total) : null, max: s ? Number(s.max_possible) : null, eliminated: !!s?.eliminated, adj: 0 }
    if (s) {
      let adj = normalizeScore(s, week)
      if (s.eliminated) adj *= settings.elimination_multiplier
      adj /= owners
      entry.adj = Math.round(adj * 100) / 100
      line.weeks[p.week_id].points += entry.adj
    }
    line.weeks[p.week_id].picks.push(entry)
  }

  // Elimination Call bonus
  for (const pr of predictions) {
    const line = lines[pr.team_id]; const week = weekById[pr.week_id]
    if (!line || !week || !weeksScored.includes(pr.week_id)) continue
    const s = scoreMap[scoreKey(pr.week_id, pr.couple_id)]
    const coupleRight = !!s?.eliminated
    const scoreRight = s ? normalizeScore(s, week) === Number(pr.predicted_score) : false
    const hit = coupleRight && (scoreRight || !settings.elim_call_requires_score)
    line.weeks[pr.week_id].call = { couple: coupleById[pr.couple_id], predicted: Number(pr.predicted_score), coupleRight, scoreRight, hit, bonus: hit ? settings.elim_call_points : 0 }
    if (hit) line.weeks[pr.week_id].points += settings.elim_call_points
  }

  // Guillermo Gauntlet: bottom-three bonus + staked vote
  const byWeek = {}
  for (const g of gauntlet) { if (lines[g.team_id] && weeksScored.includes(g.week_id)) (byWeek[g.week_id] ||= []).push(g) }
  for (const [wid, gs] of Object.entries(byWeek)) {
    const week = weekById[wid]
    const actualOut = !!scoreMap[scoreKey(wid, settings.gauntlet_target_couple)]?.eliminated
    const sides = new Set(gs.map(g => g.target_out))
    const winners = gs.filter(g => g.target_out === actualOut).length, losers = gs.length - winners
    const real = week.bottom_three || []
    const bottomPts = week.bottom_points != null ? Number(week.bottom_points) : settings.gauntlet_bottom_points
    for (const g of gs) {
      // hit = every couple the show put in the spotlight is among your three (the show can announce fewer than three)
      const bottomHit = real.length > 0 && real.every(id => g.bottom_ids.includes(id))
      let vote = 0
      if (sides.size > 1) vote = g.target_out === actualOut ? settings.gauntlet_stake * losers / winners : -settings.gauntlet_stake
      vote = Math.round(vote * 100) / 100
      const bonus = (bottomHit ? bottomPts : 0) + vote
      lines[g.team_id].weeks[wid].gauntlet = { bottom: g.bottom_ids.map(id => coupleById[id]), bottomHit, bottomScored: real.length > 0, bottomPts, targetOut: g.target_out, actualOut, unanimous: sides.size < 2, vote, bonus }
      lines[g.team_id].weeks[wid].points += bonus
    }
  }

  // Last Rites (Dedication Night on): four prop questions, each worth last_rites_points
  for (const r of lastRites) {
    const line = lines[r.team_id]; const week = weekById[r.week_id]
    if (!line || !week || !weeksScored.includes(r.week_id)) continue
    const night = scores.filter(s => s.week_id === r.week_id).map(s => ({ id: s.couple_id, n: normalizeScore(s, week), out: !!s.eliminated }))
    const hi = Math.max(...night.map(x => x.n)), lo = Math.min(...night.map(x => x.n))
    const n = (id) => night.find(x => x.id === id)?.n
    const q = {
      high: { pick: coupleById[r.high_id], hit: n(r.high_id) === hi },
      low: { pick: coupleById[r.low_id], hit: n(r.low_id) === lo },
      out: { pick: coupleById[r.out_id], hit: !!night.find(x => x.id === r.out_id)?.out },
      cry: { pick: r.judge_cries, hit: week.judge_cried != null && week.judge_cried === r.judge_cries, ruled: week.judge_cried != null },
    }
    const hits = Object.values(q).filter(x => x.hit).length
    const bonus = hits * settings.last_rites_points
    line.weeks[r.week_id].rites = { ...q, hits, bonus, each: settings.last_rites_points }
    line.weeks[r.week_id].points += bonus
  }

  for (const t of teams) {
    const line = lines[t.id]
    for (const w of weeks) line.weeks[w.id].points = Math.round(line.weeks[w.id].points * 100) / 100
    line.total = Math.round(Object.values(line.weeks).reduce((a, w) => a + w.points, 0) * 100) / 100
  }

  // weekly wins
  for (const wid of weeksScored) {
    const best = Math.max(...teams.map(t => lines[t.id].weeks[wid].points))
    for (const t of teams) if (lines[t.id].weeks[wid].points === best && best > 0) { lines[t.id].weeks[wid].won = true; lines[t.id].weeklyWins++ }
  }

  const ranked = teams.map(t => lines[t.id]).sort((a, b) => b.total - a.total || b.weeklyWins - a.weeklyWins)
  ranked.forEach((l, i) => { l.rank = i + 1; l.behind = Math.round((ranked[0].total - l.total) * 100) / 100 })
  return { teams: lines, ranked, weeksScored, settings }
}

/** Draft order for a week: week 1 by seed, otherwise reverse standings through the prior week. */
export function draftOrder({ week, weeks, teams, standingsInput }) {
  if (week.number === 1) return [...teams].sort((a, b) => a.draft_seed - b.draft_seed)
  const prior = weeks.filter(w => w.number < week.number)
  const st = computeStandings({ ...standingsInput, weeks: prior, scores: standingsInput.scores.filter(s => prior.some(w => w.id === s.week_id)),
    picks: standingsInput.picks.filter(p => prior.some(w => w.id === p.week_id)) })
  return [...st.ranked].reverse().map(l => l.team)
}

export function rosterSize(aliveCount, teamCount) {
  return Math.floor(aliveCount / teamCount)
}
export function isCrunch(aliveCount, teamCount) {
  return aliveCount < teamCount
}

/** Which team is on the clock at overall pick index i (0-based). Mirrors drafter_at() in SQL. */
export function drafterAt(orderIds, index, crunch) {
  const n = orderIds.length
  if (crunch) return orderIds[index]
  const round = Math.floor(index / n), pos = index % n
  return round % 2 === 0 ? orderIds[pos] : orderIds[n - 1 - pos]
}
export function totalPicks(draft) { return draft.crunch ? draft.order_ids.length : draft.roster * draft.order_ids.length }
