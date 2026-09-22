import { useState } from 'react'
import { useData, CoupleChip, TeamName, fmtPts } from '../ui.jsx'
import { PowerPlayFeed } from './Board.jsx'

export default function Recap() {
  const { standings, weeks, teams, members, couples, powerPlays, scores } = useData()
  const scored = standings.weeksScored
  const [sel, setSel] = useState(scored[scored.length - 1] || null)
  if (!sel) return <div className="card"><h2>No recaps yet</h2><p className="muted">Come back after the first show. Bring snacks.</p></div>
  const week = weeks.find(w => w.id === sel)
  const coupleById = Object.fromEntries(couples.map(c => [c.id, c]))
  const teamById = Object.fromEntries(teams.map(t => [t.id, t]))
  const lines = standings.ranked.map(l => ({ l, w: l.weeks[sel] })).sort((a, b) => b.w.points - a.w.points)
  const night = scores.filter(s => s.week_id === sel).map(s => ({ ...s, couple: coupleById[s.couple_id], n: Number(s.raw_total) * 30 / Number(s.max_possible) })).sort((a, b) => b.n - a.n)
  const eliminated = night.filter(s => s.eliminated)
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row">
        {scored.map(id => { const w = weeks.find(x => x.id === id); return <button key={id} className={`btn small${sel === id ? '' : ' ghost'}`} onClick={() => setSel(id)}>{w.title}</button> })}
      </div>
      <section className="hero">
        <div className="eyebrow">{week.title} recap</div>
        <h1>{lines[0].l.team.emoji} {lines[0].l.team.name} took the week</h1>
        <p style={{ margin: 0 }}>{fmtPts(lines[0].w.points)} points{lines[1] ? <>, {fmtPts(lines[0].w.points - lines[1].w.points)} clear of {lines[1].l.team.name}</> : ''}.
          {eliminated.length > 0 && <> Sent home: {eliminated.map(e => e.couple.celeb).join(' and ')}.</>}
          {night[0] && <> Top of the night: {night[0].couple.celeb} with a {night[0].raw_total}/{night[0].max_possible}.</>}</p>
      </section>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        {lines.map(({ l, w }) => (
          <section key={l.team.id} className={`card${w.won ? ' pop' : ''}`}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <TeamName team={l.team} members={members} />
              <div className="stat"><span className="v">{fmtPts(w.points)}</span><span className="k">{w.won ? '🪩 week winner' : 'points'}</span></div>
            </div>
            <table style={{ marginTop: 8 }}>
              <tbody>
                {w.picks.sort((a, b) => b.adj - a.adj).map(p => (
                  <tr key={p.couple.id}>
                    <td><CoupleChip couple={p.couple} sniped={p.sniped} shared={p.shared} out={p.eliminated} /></td>
                    <td className="num small muted">{p.raw != null ? `${p.raw}/${p.max}` : '—'}{p.eliminated ? ' · out ½' : ''}{p.shared ? ` · split ${p.owners}` : ''}</td>
                    <td className="num"><b>{fmtPts(p.adj)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <section className="card">
        <h3>Judges' board</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>Couple</th><th className="num">Score</th><th className="num">/30 basis</th><th>Drafted by</th></tr></thead>
          <tbody>{night.map(s => {
            const owner = standings.ranked.find(l => l.weeks[sel].picks.some(p => p.couple.id === s.couple_id))
            return <tr key={s.couple_id}><td><CoupleChip couple={s.couple} out={s.eliminated} /></td><td className="num">{s.raw_total}/{s.max_possible}</td><td className="num">{s.n.toFixed(1)}</td><td className="small">{owner ? `${owner.team.emoji} ${owner.team.name}` : <span className="muted">undrafted</span>}</td></tr>
          })}</tbody>
        </table></div>
      </section>
      <section className="card"><h3>Snipes this week</h3><PowerPlayFeed powerPlays={powerPlays.filter(x => x.week_id === sel)} teamById={teamById} coupleById={coupleById} weeks={weeks} /></section>
    </div>
  )
}
