// Scoring engine. Mirrors league_pick_points / league_totals in the SQL schema.
// Pure functions over plain data so demo mode and the live app share it.

export const DEFAULT_SETTINGS = {
  elimination_multiplier: 0.5,
  ride_or_die_weekly: 2,
  ride_or_die_winner: 20,
  snipes_per_season: 1,
}

export function normalizeScore(score, week) {
  // Scale to a 3-judge, 30-per-dance basis so 4-judge nights stay comparable.
  return (Number(score.raw_total) * 3) / (week.judge_count || 3)
}

/**
 * @returns {{ teams: Record<teamId, TeamLine>, ranked: TeamLine[], weeksScored: number[] }}
 * TeamLine = { team, total, weeklyWins, rod, weeks: { [weekId]: WeekLine } }
 * WeekLine = { points, picks: [{couple, raw, max, adj, shared, owners, eliminated, sniped}], rod, won }
 */
export function computeStandings({ season, league, teams, weeks, scores, picks, powerPlays, couples }) {
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
    lines[t.id] = { team: t, total: 0, weeklyWins: 0, rod: 0, weeks: {} }
    for (const w of weeks) lines[t.id].weeks[w.id] = { points: 0, picks: [], rod: 0, won: false }
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

  for (const t of teams) {
    const line = lines[t.id]
    if (t.ride_or_die) {
      for (const wid of weeksScored) {
        const s = scoreMap[scoreKey(wid, t.ride_or_die)]
        if (s && !s.eliminated) {
          line.weeks[wid].rod += settings.ride_or_die_weekly
          line.weeks[wid].points += settings.ride_or_die_weekly
          line.rod += settings.ride_or_die_weekly
        }
      }
      if (season?.winner_couple_id && season.winner_couple_id === t.ride_or_die) {
        line.rod += settings.ride_or_die_winner
      }
    }
    for (const w of weeks) line.weeks[w.id].points = Math.round(line.weeks[w.id].points * 100) / 100
    line.total = Math.round((Object.values(line.weeks).reduce((a, w) => a + w.points, 0)
      + (t.ride_or_die && season?.winner_couple_id === t.ride_or_die ? settings.ride_or_die_winner : 0)) * 100) / 100
  }

  // weekly wins
  for (const wid of weeksScored) {
    const best = Math.max(...teams.map(t => lines[t.id].weeks[wid].points))
    for (const t of teams) if (lines[t.id].weeks[wid].points === best && best > 0) { lines[t.id].weeks[wid].won = true; lines[t.id].weeklyWins++ }
  }

  const ranked = teams.map(t => lines[t.id]).sort((a, b) => b.total - a.total || b.weeklyWins - a.weeklyWins || b.rod - a.rod)
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
