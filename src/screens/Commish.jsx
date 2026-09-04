import { useEffect, useState } from 'react'
import { useData, fmtET } from '../ui.jsx'
import { fetchScoringChart, matchCouple, WIKI_PAGE } from '../lib/wikipedia.js'

export default function Commish() {
  const { api, season, league, couples, weeks, scores, weekInfo, reload, showToast, profile, isCommissioner } = useData()
  const [weekId, setWeekId] = useState(weekInfo.week.id)
  const week = weeks.find(w => w.id === weekId)
  const [judges, setJudges] = useState(week.judge_count || 3)
  const [dances, setDances] = useState(1)
  const [rows, setRows] = useState({})
  const [busy, setBusy] = useState(false)
  const [wiki, setWiki] = useState(null)
  const canScore = profile?.is_admin

  // couples eligible this week: alive before this week
  const eligible = couples.filter(c => !c.eliminated_week || c.eliminated_week >= week.number)

  useEffect(() => {
    const existing = scores.filter(s => s.week_id === weekId)
    const r = {}
    for (const c of eligible) {
      const s = existing.find(x => x.couple_id === c.id)
      r[c.id] = { total: s ? Number(s.raw_total) : '', eliminated: s ? !!s.eliminated : c.eliminated_week === week.number }
    }
    setRows(r); setJudges(week.judge_count || 3)
    const first = existing[0]; if (first) setDances(Math.max(1, Math.round(Number(first.max_possible) / (10 * (week.judge_count || 3)))))
  }, [weekId])

  const maxPossible = 10 * judges * dances
  const set = (id, patch) => setRows(r => ({ ...r, [id]: { ...r[id], ...patch } }))

  async function save() {
    setBusy(true)
    try {
      const out = Object.entries(rows).filter(([, v]) => v.total !== '' && v.total != null).map(([id, v]) => ({ couple_id: Number(id), raw_total: Number(v.total), max_possible: maxPossible, eliminated: !!v.eliminated }))
      if (!out.length) throw new Error('No scores entered')
      const elim = out.filter(o => o.eliminated).map(o => o.couple_id)
      await api.saveScores({ ...week, judge_count: judges }, out, elim)
      showToast(`${week.title} saved. ${elim.length ? elim.length + ' sent home.' : 'Nobody went home.'}`); reload()
    } catch (e) { showToast(e.message, true) } finally { setBusy(false) }
  }

  async function importWiki() {
    setBusy(true); setWiki(null)
    try {
      const chart = await fetchScoringChart()
      const wk = chart.weeks.includes(week.number) ? week.number : null
      if (!wk) throw new Error(`Wikipedia's chart doesn't have week ${week.number} yet. Try again in an hour.`)
      let matched = 0, unmatched = []
      const next = { ...rows }
      let d = 1
      for (const r of chart.rows) {
        const c = matchCouple(r, couples); const s = r.scores[wk]
        if (!c) { unmatched.push(r.couple); continue }
        if (!s) continue
        next[c.id] = { ...(next[c.id] || {}), total: s.total, eliminated: next[c.id]?.eliminated || false }; matched++; d = Math.max(d, s.dances)
      }
      setRows(next); setDances(d)
      setWiki({ matched, unmatched })
      showToast(`Pulled ${matched} scores from Wikipedia. Check eliminations, then save.`)
    } catch (e) { showToast(e.message, true) } finally { setBusy(false) }
  }


  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="hero">
        <div className="eyebrow">Commissioner's office</div>
        <h1>You are never wrong</h1>
        <p style={{ margin: 0 }}>Invite code for <b>{league.name}</b>: <span className="mono" style={{ fontSize: '1.3rem', letterSpacing: '0.1em' }}>{league.invite_code}</span> · Text it. That's the whole onboarding.</p>
      </section>

      <section className="card pop">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Judges' scores</h2>
          <div className="row">
            <select value={weekId} onChange={e => setWeekId(Number(e.target.value))} aria-label="Week">{weeks.map(w => <option key={w.id} value={w.id}>{w.title}{scores.some(s => s.week_id === w.id) ? ' ✓' : ''}</option>)}</select>
            <label className="small">Judges <select value={judges} onChange={e => setJudges(Number(e.target.value))}>{[3, 4].map(n => <option key={n}>{n}</option>)}</select></label>
            <label className="small">Dances <select value={dances} onChange={e => setDances(Number(e.target.value))}>{[1, 2, 3].map(n => <option key={n}>{n}</option>)}</select></label>
          </div>
        </div>
        <p className="small muted">Enter each couple's total paddles for the night (all dances added up), out of {maxPossible}. Tick anyone who went home. Show locks {fmtET(week.show_lock_at)}.</p>
        {!canScore && <p className="small" style={{ color: 'var(--bad)' }}>Only the site admin can enter scores (they're shared by every league). Ask them, or set <code>is_admin</code> on your profile.</p>}
        <div className="row" style={{ margin: '8px 0 14px' }}>
          <button className="btn blue small" disabled={busy || !canScore} onClick={importWiki}>Auto-fill from Wikipedia</button>
          <span className="small muted">Reads the scoring chart on <a href={`https://en.wikipedia.org/wiki/${WIKI_PAGE}`} target="_blank" rel="noreferrer">the season page</a>, usually updated within an hour of the show. Eliminations still need a tick.</span>
        </div>
        {wiki && wiki.unmatched.length > 0 && <p className="small" style={{ color: 'var(--bad)' }}>Couldn't match: {wiki.unmatched.join(', ')}</p>}
        <div className="score-grid">
          <span className="head">Couple</span><span className="head" style={{ gridColumn: 'span 3' }}>Total / {maxPossible}</span><span className="head">Sent home</span>
          {eligible.map(c => (
            <FragmentRow key={c.id}>
              <span><b>{c.celeb}</b> <span className="small muted">& {c.pro}</span></span>
              <input type="number" min="0" max={maxPossible} step="0.5" value={rows[c.id]?.total ?? ''} onChange={e => set(c.id, { total: e.target.value })} disabled={!canScore} aria-label={`${c.celeb} total`} style={{ gridColumn: 'span 3' }} />
              <label style={{ textAlign: 'center' }}><input type="checkbox" checked={!!rows[c.id]?.eliminated} onChange={e => set(c.id, { eliminated: e.target.checked })} disabled={!canScore} /></label>
            </FragmentRow>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="btn" disabled={busy || !canScore} onClick={save}>Save {week.title}</button>
        </div>
      </section>

      <div className="grid two">
        <section className="card">
          <h3>Draft controls</h3>
          <p className="small muted">The live draft runs in the <a href="#draft">Draft Room</a>: you open it (any time; friends can open it themselves once it's {fmtET(week.draft_opens_at)}), 60 seconds a pick, random auto-pick on a missed turn. A do-over button lives at the bottom of the Draft Room.</p>
        </section>
        <section className="card">
          <h3>Crown the champion</h3>
          <p className="small muted">After the finale, set the Mirrorball winner so Ride or Die bonuses pay out.</p>
          <select disabled={!canScore} value={season.winner_couple_id || ''} onChange={async e => { await api.setWinner(season.id, Number(e.target.value) || null); showToast('Winner set. Confetti implied.'); reload() }} aria-label="Winner">
            <option value="">Season still going…</option>
            {couples.map(c => <option key={c.id} value={c.id}>{c.celeb} & {c.pro}</option>)}
          </select>
        </section>
      </div>

      <section className="card">
        <h3>League settings</h3>
        <div className="row small mono" style={{ gap: 16 }}>{Object.entries(league.settings || {}).map(([k, v]) => <span key={k}><span className="muted">{k}</span> {String(v)}</span>)}</div>
        <p className="small muted">Editable in the <code>leagues.settings</code> JSON for now. A settings form is a v2 thing.</p>
      </section>
    </div>
  )
}

function FragmentRow({ children }) { return <>{children}</> }
