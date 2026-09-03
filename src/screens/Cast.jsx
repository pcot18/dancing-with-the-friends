import { useData, initials } from '../ui.jsx'
import { TIERS } from '../data/cast.js'

export default function Cast() {
  const { couples, scores, weeks, teams, picks } = useData()
  const avg = (c) => { const ss = scores.filter(s => s.couple_id === c.id); return ss.length ? ss.reduce((a, s) => a + Number(s.raw_total) * 30 / Number(s.max_possible), 0) / ss.length : null }
  const last = (c) => { const ss = scores.filter(s => s.couple_id === c.id).sort((a, b) => b.week_id - a.week_id); return ss[0] ? Number(ss[0].raw_total) * 30 / Number(ss[0].max_possible) : null }
  const rodBy = Object.fromEntries(teams.filter(t => t.ride_or_die).map(t => [t.ride_or_die, t]))
  const tiers = [1, 2, 3]
  return (
    <div className="stack" style={{ gap: 24 }}>
      <section className="hero">
        <div className="eyebrow">Season 35 · Scouting reports</div>
        <h1>Know your dancers</h1>
        <p style={{ margin: 0 }}>Draft grades are pre-season and mean nothing, which has never stopped anyone. Comps are past DWTS contestants. Floor and ceiling are on a 30-point scale.</p>
      </section>
      {tiers.map(t => (
        <section key={t} className="stack">
          <div className="row" style={{ alignItems: 'baseline' }}>
            <h2>Tier {t} · {TIERS[t]}</h2>
            <span className="small muted">{t === 1 ? 'Pro-level experience. Everyone knows it. The judges will pretend not to.' : t === 2 ? 'Athleticism, rhythm, or a wildly motivated pro. Where the value picks live.' : 'The judges may not love them. Does not matter. They will outlast someone in Tier 1 and it will make you furious.'}</span>
          </div>
          <div className="grid two">
            {couples.filter(c => c.tier === t).map(c => {
              const a = avg(c), l = last(c)
              return (
                <article key={c.id} className={`card scout t${t}`} style={c.eliminated_week ? { opacity: 0.65 } : undefined}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="row">
                      <span className="couple-chip" style={{ padding: 4 }}><span className="av" style={{ width: 44, height: 44, fontSize: '1rem' }}>{initials(c)}</span></span>
                      <div><div className="name">{c.celeb}</div><div className="small muted">with {c.pro} · {c.known_for}</div></div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {c.eliminated_week ? <span className="pill out">Out wk {c.eliminated_week}</span> : <span className="pill blue">Dancing</span>}
                      {rodBy[c.id] && <span className="pill gold" title={`${rodBy[c.id].name}'s Ride or Die`}>💍 {rodBy[c.id].emoji}</span>}
                    </div>
                  </div>
                  <div className="eyebrow" style={{ color: 'var(--pink-deep)' }}>{c.position}</div>
                  <dl>
                    <dt>Floor / Ceiling</dt><dd>{c.floor} / {c.ceiling}</dd>
                    <dt>Season avg</dt><dd>{a != null ? <>{a.toFixed(1)} <span className="muted">· last {l.toFixed(0)}</span></> : '—'}</dd>
                    <dt>Comp</dt><dd>{c.comp}</dd>
                    <dt>Vote engine</dt><dd>{c.vote_engine}</dd>
                    <dt>Draft grade</dt><dd className="grade">{c.grade}</dd>
                  </dl>
                  <p className="small" style={{ margin: 0 }}>{c.bio}</p>
                  <p className="small flag" style={{ margin: 0 }}><b>Red flag:</b> {c.red_flag}</p>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
