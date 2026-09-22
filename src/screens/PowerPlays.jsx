import { useState } from 'react'
import { useData, CoupleChip, TeamName, fmtCountdown, fmtET } from '../ui.jsx'

export default function PowerPlays() {
  const { api, league, teams, members, couples, picks, powerPlays, myTeam, weekInfo, reload, showToast } = useData()
  const { week, phase, msToShowLock } = weekInfo
  const s = league.settings || {}
  const coupleById = Object.fromEntries(couples.map(c => [c.id, c]))
  const mine = powerPlays.filter(x => x.team_id === myTeam?.id)
  const snipesLeft = (s.snipes_per_season ?? 1) - mine.filter(x => x.kind === 'snipe').length
  const windowOpen = phase === 'window'
  const weekPicks = picks.filter(p => p.week_id === week.id)
  const myPicks = weekPicks.filter(p => p.team_id === myTeam?.id && !p.sniped)
  const crunch = weekPicks.some(p => p.shared)
  const rivals = teams.filter(t => t.id !== myTeam?.id)

  const [target, setTarget] = useState('')
  const [give, setGive] = useState('')
  const [take, setTake] = useState('')
  const [busy, setBusy] = useState(false)
  const theirPicks = weekPicks.filter(p => p.team_id === target && !p.sniped)

  async function snipe() {
    setBusy(true)
    try { await api.useSnipe(week.id, target, Number(give), Number(take)); showToast('Sniped. They\'ll find out at showtime.'); setTarget(''); setGive(''); setTake(''); reload() }
    catch (e) { showToast(e.message, true) } finally { setBusy(false) }
  }
  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="hero">
        <div className="eyebrow">Power play · {week.title}</div>
        <h1>The Snipe</h1>
        <p style={{ margin: 0 }}>
          {windowOpen ? <>The trade window is open for <b className="mono">{fmtCountdown(msToShowLock)}</b>. A snipe is hidden until the show locks at {fmtET(week.show_lock_at)}, then it's revealed on the Board for everyone. Enjoy that.</>
            : phase === 'pre' || phase === 'drafting' ? <>The snipe window opens the moment the live draft finishes and closes at showtime ({fmtET(week.show_lock_at)}).</>
            : <>Window's closed for this week. Plot for next week.</>}
        </p>
      </section>

      <div className="grid two">
        <section className={`card${snipesLeft > 0 ? ' pop' : ''}`}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>🎯 Use your snipe</h2>
            <span className={`pill ${snipesLeft > 0 ? 'pink' : 'out'}`}>{snipesLeft} left this season</span>
          </div>
          <p className="small muted">Force a trade before the show goes live: hand a rival one of your drafted couples and take one of theirs. Once per season. A couple that's been sniped this week can't be sniped again, so there's no snipe-back. Not available in crunch time.</p>
          {snipesLeft > 0 && windowOpen && !crunch && myPicks.length > 0 ? (
            <div className="stack" style={{ marginTop: 8 }}>
              <select value={target} onChange={e => { setTarget(e.target.value); setTake('') }} aria-label="Victim">
                <option value="">Choose your victim…</option>
                {rivals.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
              </select>
              <select value={give} onChange={e => setGive(e.target.value)} aria-label="Couple to give">
                <option value="">You give up…</option>
                {myPicks.map(p => <option key={p.couple_id} value={p.couple_id}>{coupleById[p.couple_id].celeb}</option>)}
              </select>
              <select value={take} onChange={e => setTake(e.target.value)} disabled={!target} aria-label="Couple to take">
                <option value="">…and you take</option>
                {theirPicks.map(p => <option key={p.couple_id} value={p.couple_id}>{coupleById[p.couple_id].celeb}</option>)}
              </select>
              <button className="btn" disabled={busy || !target || !give || !take} onClick={snipe}>Pull the trigger</button>
            </div>
          ) : <p className="small muted" style={{ marginTop: 8 }}>{snipesLeft <= 0 ? 'Spent. It was worth it, probably.' : crunch ? 'No snipes during crunch time.' : !windowOpen ? 'Come back during the trade window.' : 'You have no un-sniped couples this week.'}</p>}
        </section>

        <section className="card">
          <h3>How it plays</h3>
          <p className="small muted">One per team, all season. Use it the week the draft goes badly, or the week a rival lands the obvious ringer, or never, so everyone else spends the whole season wondering when you'll do it. Once both couples are swapped they're locked: nobody can snipe them back the same week. The victim finds out when the show locks and the Board reveals it.</p>
        </section>
      </div>

      <section className="card">
        <h3>Your record</h3>
        {mine.length === 0 ? <p className="muted">Clean sheet. Nobody believes it.</p> : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {mine.map(x => {
              const them = teams.find(t => t.id === x.target_team_id)
              return <li key={x.id} className="small">🎯 Week {x.week_id}: took <b>{coupleById[x.take_couple_id]?.celeb}</b> from {them?.name}, gave <b>{coupleById[x.give_couple_id]?.celeb}</b></li>
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h3>Ideas for next season's bag of tricks</h3>
        <p className="small muted">The Illegal Lift (flag a rival, minus 3, Carrie Ann approved) · The Bruno (double one couple's score, declared before lock) · The Redemption Dance (re-draft one of your picks from the undrafted pool).</p>
      </section>
    </div>
  )
}
