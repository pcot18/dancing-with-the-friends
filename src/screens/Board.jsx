import { useData, CoupleChip, TeamName, Sparkles, fmtCountdown, fmtET, fmtPts } from '../ui.jsx'
import { rosterSize, isCrunch } from '../lib/scoring.js'

const SERIES = ['var(--pink-deep)', 'var(--blue-deep)', 'var(--gold)', 'var(--ink)', 'var(--good)', 'var(--bad)']

export default function Board() {
  const { standings, teams, members, weeks, couples, picks, powerPlays, weekInfo, myTeam, league, api } = useData()
  const { week, phase, msToOpen, msToShowLock, draft } = weekInfo
  const leader = standings.ranked[0]
  const second = standings.ranked[1]
  const coupleById = Object.fromEntries(couples.map(c => [c.id, c]))
  const teamById = Object.fromEntries(teams.map(t => [t.id, t]))
  const alive = couples.filter(c => !c.eliminated_week)
  const lastScored = standings.weeksScored[standings.weeksScored.length - 1]
  const lastWeek = weeks.find(w => w.id === lastScored)
  const weekPicks = picks.filter(p => p.week_id === week.id)
  const crunch = isCrunch(alive.length, teams.length)

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="hero">
        <Sparkles n={9} seed={11} />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="eyebrow">{league.name} · Season tracker</div>
          <span className={`pill ${phase === 'drafting' ? 'live' : phase === 'window' ? 'pink' : 'blue'}`}>
            {phase === 'pre' && `${week.title} · draft not started`}
            {phase === 'drafting' && 'Draft in progress'}
            {phase === 'window' && 'Snipe window open · scores pending'}
            {phase === 'scored' && 'Season complete'}
          </span>
        </div>
        {leader && standings.weeksScored.length > 0 ? (
          <>
            <h1>{leader.team.emoji} {leader.team.name} {leader.behind === 0 && second?.behind === 0 ? 'is tied on top' : 'leads'}</h1>
            <p style={{ margin: 0 }}>
              {second && second.behind > 0 ? <>by <b className="mono">{fmtPts(second.behind)}</b> over {second.team.name}</> : <>Dead heat. Someone's going to snipe someone.</>}
              {' · '}<span className="muted">{standings.weeksScored.length} week{standings.weeksScored.length === 1 ? '' : 's'} scored, {alive.length} couples left</span>
            </p>
          </>
        ) : (
          <><h1>Nobody's scored yet</h1><p style={{ margin: 0 }}>The commissioner starts the draft in the <a href="#draft">Draft Room</a>. Be there or get Guillermo.</p></>
        )}
      </section>

      <div className="grid two">
        <section className="card pop">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h2>Standings</h2>
            <span className="eyebrow">{lastWeek ? `through ${lastWeek.title.toLowerCase()}` : 'pre-season'}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th></th><th>Team</th><th className="num">Pts</th><th className="num">Back</th><th className="num">Wk W</th><th className="num">Last</th></tr></thead>
              <tbody>
                {standings.ranked.map(l => (
                  <tr key={l.team.id} className={`${l.rank === 1 ? 'leader ' : ''}${myTeam?.id === l.team.id ? 'me' : ''}`}>
                    <td><span className="rank">{l.rank === 1 ? '👑' : l.rank}</span></td>
                    <td><TeamName team={l.team} members={members} /></td>
                    <td className="num"><b>{fmtPts(l.total)}</b></td>
                    <td className="num muted">{l.behind === 0 ? '—' : fmtPts(l.behind)}</td>
                    <td className="num">{l.weeklyWins}</td>
                    <td className="num">{lastScored ? fmtPts(l.weeks[lastScored].points) : '—'}{lastScored && l.weeks[lastScored].won ? ' 🪩' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>Tiebreaker: weekly wins. 🪩 = won the week.</p>
        </section>

        <section className="card">
          <h2>The race</h2>
          <RaceChart standings={standings} weeks={weeks} />
        </section>
      </div>

      <section className="card blue">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{week.title} draft board</h2>
          <span className="pill">{crunch ? 'Crunch time · shared picks' : `${rosterSize(alive.length, teams.length)} per team · ${alive.length - rosterSize(alive.length, teams.length) * teams.length} undrafted`}</span>
        </div>
        {phase === 'pre' ? (
          <p className="muted">Draft hasn't started. When the commissioner hits the button in the <a href="#draft">Draft Room</a>: 60 seconds a pick, random auto-pick if you're not there.</p>
        ) : phase === 'drafting' ? (
          <p className="muted">Draft is happening right now, pick {draft.current_index + 1} of {teams.length * draft.roster}. <a href="#draft">Get in the room.</a></p>
        ) : weekPicks.length === 0 ? (
          <p className="muted">No picks yet.</p>
        ) : (
          <div className="grid three" style={{ marginTop: 10 }}>
            {teams.map(t => (
              <div key={t.id} className={`card reveal${myTeam?.id === t.id ? ' blue' : ''}`} style={{ padding: 14 }}>
                <TeamName team={t} members={members} small />
                <div className="row" style={{ marginTop: 8, gap: 6 }}>
                  {weekPicks.filter(p => p.team_id === t.id).sort((a, b) => a.pick_number - b.pick_number).map(p => (
                    <CoupleChip key={p.couple_id} couple={coupleById[p.couple_id]} sniped={p.sniped} shared={p.shared} title={p.auto ? 'Random auto-pick' : `Pick #${p.pick_number}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {phase === 'window' && myTeam && <p className="small" style={{ marginTop: 10 }}>Snipe window is open until the scores go in. <a href="#power">Use yours</a> if you dare.</p>}
      </section>

      <section className="card">
        <h2>Snipe wire</h2>
        <PowerPlayFeed powerPlays={powerPlays} teamById={teamById} coupleById={coupleById} weeks={weeks} />
      </section>
    </div>
  )
}

export function PowerPlayFeed({ powerPlays, teamById, coupleById, weeks }) {
  const wk = Object.fromEntries(weeks.map(w => [w.id, w]))
  const items = [...powerPlays].sort((a, b) => wk[b.week_id].number - wk[a.week_id].number)
  if (!items.length) return <p className="muted">Quiet so far. Suspiciously quiet.</p>
  return (
    <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
      {items.map(x => {
        const me = teamById[x.team_id], them = teamById[x.target_team_id]
        return (
          <li key={x.id} className="row" style={{ gap: 8 }}>
            <span className="pill pink">🎯 Snipe</span>
            <span className="small">
              <b>{wk[x.week_id].title}:</b> {me?.emoji} {me?.name} took <b>{coupleById[x.take_couple_id]?.celeb}</b> from {them?.emoji} {them?.name} and stuck them with <b>{coupleById[x.give_couple_id]?.celeb}</b>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function RaceChart({ standings, weeks }) {
  const scored = standings.weeksScored
  if (scored.length < 1) return <p className="muted">The line chart shows up after the first scored week. Right now it's four dots.</p>
  const W = 520, H = 220, padL = 36, padR = 78, padT = 12, padB = 26
  const wk = Object.fromEntries(weeks.map(w => [w.id, w]))
  const series = standings.ranked.map((l, i) => {
    let acc = 0
    return { l, color: SERIES[i % SERIES.length], pts: scored.map(wid => { acc += l.weeks[wid].points; return acc }) }
  })
  const all = series.flatMap(s => s.pts)
  const hi = Math.max(10, ...all), lo = Math.min(...all)
  const span = Math.max(10, hi - lo)
  const maxY = hi + span * 0.15, minY = Math.max(0, lo - span * 0.15)
  const x = i => padL + (i / Math.max(1, scored.length - 1)) * (W - padL - padR)
  const y = v => padT + (1 - (v - minY) / (maxY - minY)) * (H - padT - padB)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(minY + (maxY - minY) * f))
  // end labels: nudge apart so close finishes stay readable
  const ends = series.map(s => ({ id: s.l.team.id, y: y(s.pts[s.pts.length - 1]) + 4 })).sort((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14
  const labelY = Object.fromEntries(ends.map(e => [e.id, e.y]))
  return (
    <div className="table-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 560, display: 'block' }} role="img" aria-label="Cumulative points by week">
        {ticks.map(t => <g key={t}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" /><text x={padL - 6} y={y(t) + 4} fontSize="10" textAnchor="end" fill="var(--muted)" fontFamily="DM Mono, monospace">{t}</text></g>)}
        {scored.map((wid, i) => <text key={wid} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="var(--muted)" fontFamily="DM Mono, monospace">W{wk[wid].number}</text>)}
        {series.map(s => (
          <g key={s.l.team.id}>
            <polyline fill="none" stroke={s.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={s.pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
            {s.pts.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === s.pts.length - 1 ? 5 : 3} fill={s.color} />)}
            <text x={W - padR + 8} y={labelY[s.l.team.id]} fontSize="12" fill={s.color} fontWeight="800" fontFamily="Nunito, sans-serif">{s.l.team.emoji} {fmtPts(s.pts[s.pts.length - 1])}</text>
          </g>
        ))}
      </svg>
      <div className="row small" style={{ gap: 14, marginTop: 6 }}>{series.map(s => <span key={s.l.team.id} style={{ color: s.color, fontWeight: 800 }}>● {s.l.team.name}</span>)}</div>
    </div>
  )
}
