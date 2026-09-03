import { useEffect, useMemo, useState } from 'react'
import { useData, CoupleChip, TeamName, fmtCountdown, fmtET, initials } from '../ui.jsx'
import { draftOrder, rosterSize, isCrunch, previewDraft } from '../lib/scoring.js'

export default function Picks() {
  const { api, season, league, teams, members, weeks, couples, scores, picks, powerPlays, rankings, myTeam, weekInfo, reload, showToast, now } = useData()
  const { week, phase, msToRankLock } = weekInfo
  const alive = couples.filter(c => !c.eliminated_week)
  const crunch = isCrunch(alive.length, teams.length)
  const roster = rosterSize(alive.length, teams.length)

  // season average per couple, for the default order and the "form" bar
  const avg = useMemo(() => {
    const m = {}
    for (const c of couples) {
      const ss = scores.filter(s => s.couple_id === c.id)
      m[c.id] = ss.length ? ss.reduce((a, s) => a + Number(s.raw_total) * 30 / Number(s.max_possible), 0) / ss.length : null
    }
    return m
  }, [couples, scores])
  const defaultOrder = [...alive].sort((a, b) => (avg[b.id] ?? (b.floor + b.ceiling) / 2) - (avg[a.id] ?? (a.floor + a.ceiling) / 2)).map(c => c.id)

  const saved = rankings.find(r => r.team_id === myTeam?.id && r.week_id === week.id)
  const [order, setOrder] = useState(() => saved ? [...saved.ordered_couple_ids.filter(id => alive.some(c => c.id === id)), ...defaultOrder.filter(id => !saved.ordered_couple_ids.includes(id))] : defaultOrder)
  const [dirty, setDirty] = useState(false)
  const [drag, setDrag] = useState(null)
  useEffect(() => { if (saved && !dirty) setOrder([...saved.ordered_couple_ids.filter(id => alive.some(c => c.id === id)), ...defaultOrder.filter(id => !saved.ordered_couple_ids.includes(id))]) }, [saved?.updated_at])

  const coupleById = Object.fromEntries(couples.map(c => [c.id, c]))
  const dOrder = draftOrder({ week, weeks, teams, standingsInput: { season, league, teams, weeks, scores, picks, powerPlays, couples } })
  const mySlot = dOrder.findIndex(t => t.id === myTeam?.id) + 1

  // preview: my ranking vs everyone else ranking by form
  const preview = useMemo(() => {
    if (crunch || !myTeam) return null
    const rk = Object.fromEntries(teams.map(t => [t.id, t.id === myTeam.id ? order : defaultOrder]))
    return previewDraft({ order: dOrder, rankings: rk, alive: alive.map(c => c.id), roster, fallbackOrder: defaultOrder })[myTeam.id]
  }, [order, crunch, myTeam, teams.length, roster])

  function move(i, dir) { const j = i + dir; if (j < 0 || j >= order.length) return; const o = [...order]; ;[o[i], o[j]] = [o[j], o[i]]; setOrder(o); setDirty(true) }
  function onDrop(i) { if (drag == null || drag === i) return; const o = [...order]; const [x] = o.splice(drag, 1); o.splice(i, 0, x); setOrder(o); setDrag(null); setDirty(true) }
  async function save() {
    try { await api.saveRanking(myTeam.id, week.id, order); setDirty(false); showToast('Rankings saved. Now go act casual.'); reload() }
    catch (e) { showToast(e.message, true) }
  }

  if (!myTeam) return <div className="card"><p>You're not on a team in this league yet.</p></div>
  const locked = phase !== 'ranking'

  return (
    <div className="stack" style={{ gap: 20 }}>
      <RideOrDie />

      <section className="card pop">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow">{week.title} · <TeamName team={myTeam} members={members} small /></div>
            <h2 style={{ marginTop: 4 }}>{crunch ? 'Crunch time: pick one' : 'Rank the field'}</h2>
          </div>
          <span className={`pill ${locked ? 'out' : 'blue'}`}>{locked ? `Locked ${fmtET(week.rankings_lock_at)}` : `Locks in ${fmtCountdown(msToRankLock)}`}</span>
        </div>
        {crunch ? (
          <p className="muted">Fewer couples than teams, so everyone picks exactly one and duplicates are allowed. Your #1 is your pick. If three teams pick the same couple, that couple's points get split three ways. Read the room.</p>
        ) : (
          <p className="muted">Drag (or use the arrows) to order every couple. At lock the snake draft runs off everyone's list: you get the highest couple on your list that's still available, {roster} time{roster === 1 ? '' : 's'}. You pick <b>#{mySlot} of {teams.length}</b> this week{week.number === 1 ? ' (random)' : ' (reverse standings)'}.</p>
        )}
        {!crunch && preview && (
          <div className="card blue" style={{ padding: 12, marginTop: 8 }}>
            <div className="eyebrow">If everyone else ranks by form, you'd get</div>
            <div className="row" style={{ marginTop: 6 }}>{preview.map(id => <CoupleChip key={id} couple={coupleById[id]} />)}</div>
          </div>
        )}
        <ol className="rank-list" style={{ marginTop: 14 }}>
          {order.map((id, i) => {
            const c = coupleById[id]
            const form = avg[id]
            return (
              <li key={id} className={`rank-item${drag === i ? ' dragging' : ''}`} draggable={!locked} onDragStart={() => setDrag(i)} onDragOver={e => e.preventDefault()} onDrop={() => onDrop(i)}
                  style={crunch && i === 0 ? { borderColor: 'var(--pink-deep)' } : undefined}>
                <span className="n">{i + 1}</span>
                <span>
                  <b>{c.celeb}</b> <span className="muted small">& {c.pro}</span>
                  <div className="row small muted" style={{ gap: 8 }}>
                    <span className="mono">{form != null ? `avg ${form.toFixed(1)}` : `proj ${c.floor}–${c.ceiling}`}</span>
                    <span className="bar" style={{ width: 90, display: 'inline-block' }}><i style={{ width: `${((form ?? (c.floor + c.ceiling) / 2) / 30) * 100}%` }} /></span>
                    <span>{c.grade}</span>
                  </div>
                </span>
                <span className="arrows">
                  <button type="button" aria-label="Move up" disabled={locked || i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" aria-label="Move down" disabled={locked || i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
                </span>
              </li>
            )
          })}
        </ol>
        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span className="small muted">{saved ? `Last saved ${new Date(saved.updated_at).toLocaleString()}` : 'Not saved yet — you\'d be auto-ranked by form.'}</span>
          <button className="btn" disabled={locked || !dirty} onClick={save}>{locked ? 'Locked' : 'Save rankings'}</button>
        </div>
      </section>
    </div>
  )
}

function RideOrDie() {
  const { api, couples, teams, myTeam, weeks, now, reload, showToast, league } = useData()
  const week1 = weeks[0]
  const open = now.getTime() < new Date(week1.rankings_lock_at).getTime()
  const taken = Object.fromEntries(teams.filter(t => t.ride_or_die).map(t => [t.ride_or_die, t]))
  const mine = couples.find(c => c.id === myTeam?.ride_or_die)
  const [choice, setChoice] = useState('')
  async function claim() {
    try { await api.updateTeam(myTeam.id, { ride_or_die: Number(choice) }); showToast('Claimed. No takebacks.'); reload() }
    catch (e) { showToast(/unique|duplicate/i.test(e.message) ? 'Someone claimed them first. Brutal.' : e.message, true) }
  }
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>💍 Ride or Die</h3>
        <span className="pill gold">+{league.settings?.ride_or_die_weekly ?? 2}/week alive · +{league.settings?.ride_or_die_winner ?? 20} if they win</span>
      </div>
      {mine ? (
        <p>You're riding with <CoupleChip couple={mine} /> {mine.eliminated_week ? <span className="pill out">gone in week {mine.eliminated_week}. RIP.</span> : <span className="muted small">still dancing</span>}</p>
      ) : open ? (
        <div className="row">
          <select value={choice} onChange={e => setChoice(e.target.value)} aria-label="Ride or Die">
            <option value="">Pick your season-long couple…</option>
            {couples.map(c => <option key={c.id} value={c.id} disabled={!!taken[c.id]}>{c.celeb} & {c.pro}{taken[c.id] ? ` — taken by ${taken[c.id].name}` : ''}</option>)}
          </select>
          <button className="btn small blue" disabled={!choice} onClick={claim}>Claim</button>
          <span className="small muted">One per team, first come first served, closes at the week 1 lock.</span>
        </div>
      ) : <p className="muted">You never picked one. That's a choice too.</p>}
    </section>
  )
}
