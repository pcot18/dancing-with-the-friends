import { useEffect, useMemo, useState } from 'react'
import { THEMES } from '../data/cast.js'
import FootballShow from './FootballShow.jsx'

// Scramble the whole field, then reveal the draft order from last pick to first.
// Every client renders this off the draft's started_at, so the room stays in sync.
export default function DanceOff({ draft, teams, members, now, week }) {
  const theme = { ...THEMES.default, ...(THEMES[week?.number] || {}) }
  const MOVES = theme.moves, CALLS = theme.calls
  const img = theme.image ? `${import.meta.env.BASE_URL}${theme.image}` : null
  const teamById = Object.fromEntries(teams.map(t => [t.id, t]))
  const order = draft.order_ids
  const n = order.length
  const t0 = new Date(draft.started_at).getTime()
  const total = draft.reveal_seconds * 1000
  const elapsed = Math.max(0, now.getTime() - t0)
  const revealMs = 1100                          // per slot, revealed last → first
  const scrambleMs = Math.max(2500, total - revealMs * n - 600)
  const showing = theme.scene === 'superbowl' && elapsed < scrambleMs
  // how many slots (from the bottom) are locked in
  const locked = elapsed < scrambleMs ? 0 : Math.min(n, Math.floor((elapsed - scrambleMs) / revealMs) + 1)
  const lockedIds = new Set(order.slice(n - locked))

  // fast local shuffle of the still-dancing teams (purely cosmetic; runs at 8fps)
  const [tick, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 125); return () => clearInterval(id) }, [])
  const dancing = useMemo(() => {
    const ids = order.filter(id => !lockedIds.has(id))
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]] }
    return ids
  }, [tick, locked])

  // slots top → bottom: 1..n. Unrevealed slots show a dancing team; revealed ones show the real team.
  const rows = order.map((id, i) => {
    const slot = i + 1
    const revealed = i >= n - locked
    const shown = revealed ? id : dancing[i % Math.max(1, dancing.length)]
    return { slot, revealed, team: teamById[shown], real: teamById[id] }
  })
  const call = CALLS[Math.floor(elapsed / 1400) % CALLS.length]
  const done = locked >= n

  return (
    <section className="hero danceoff" style={{ borderColor: 'var(--pink-deep)', ...(theme.tint ? { backgroundImage: theme.tint } : {}) }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="eyebrow">Draft order · {theme.name || 'dance-off'}</div>
        <span className="pill live">Live</span>
      </div>
      <div className="row" style={{ alignItems: 'center', gap: 16, flexWrap: 'nowrap' }}>
        {img && <img src={img} alt="" className={`danceoff-host${done ? '' : ' judging'}`} />}
        <div style={{ minWidth: 0 }}>
          <h1 className="shimmer">{done ? 'Order is set. Clocks start now.' : locked > 0 ? `And picking ${ordinal(n - locked + 1)}…` : theme.headline}</h1>
          <p className="muted" style={{ margin: 0, minHeight: '1.5em' }}>{done ? theme.done : call}</p>
        </div>
      </div>
      {showing && <FootballShow t={elapsed} sceneMs={scrambleMs / 3} />}
      <ol className="danceoff-list">
        {rows.map(r => (
          <li key={r.slot} className={`danceoff-row${r.revealed ? ' revealed' : ''}`}>
            <span className="danceoff-slot">{r.revealed ? ordinal(r.slot) : '??'}</span>
            <span className={`danceoff-em${r.revealed ? '' : ' dancing'}`}>{r.revealed ? r.team.emoji : MOVES[(tick + r.slot * 3) % MOVES.length]}</span>
            <span className={`danceoff-name${r.revealed ? '' : ' scramble'}`}>
              {r.revealed ? <>{r.team.name} <span className="small muted" style={{ fontWeight: 400 }}>{members.filter(m => m.team_id === r.team.id).map(m => m.display_name).join(' & ')}</span></> : r.team?.name}
            </span>
            {r.revealed && r.slot === 1 && <span className="pill gold">First pick</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

function ordinal(n) { return n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th') }
