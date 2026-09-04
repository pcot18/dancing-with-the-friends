import { useEffect, useMemo, useRef, useState } from 'react'
import { useData, CoupleChip, TeamName, Sparkles, fmtCountdown, fmtET, initials } from '../ui.jsx'
import { drafterAt, totalPicks, rosterSize, isCrunch } from '../lib/scoring.js'

export default function DraftRoom() {
  const { api, league, teams, members, couples, scores, picks, myTeam, weekInfo, now, reload, showToast, isCommissioner, profile } = useData()
  const { week, phase, draft, msToOpen, roomOpen } = weekInfo
  const coupleById = Object.fromEntries(couples.map(c => [c.id, c]))
  const teamById = Object.fromEntries(teams.map(t => [t.id, t]))
  const alive = couples.filter(c => !c.eliminated_week)
  const crunch = isCrunch(alive.length, teams.length)
  const roster = crunch ? 1 : rosterSize(alive.length, teams.length)
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState(null)

  const avg = useMemo(() => {
    const m = {}
    for (const c of couples) { const ss = scores.filter(s => s.couple_id === c.id); m[c.id] = ss.length ? ss.reduce((a, s) => a + Number(s.raw_total) * 30 / Number(s.max_possible), 0) / ss.length : null }
    return m
  }, [couples, scores])

  const weekPicks = picks.filter(p => p.week_id === week.id).sort((a, b) => a.pick_number - b.pick_number)
  const taken = new Set(weekPicks.map(p => p.couple_id))
  const pool = alive.filter(c => draft?.crunch || !taken.has(c.id)).sort((a, b) => (avg[b.id] ?? (b.floor + b.ceiling) / 2) - (avg[a.id] ?? (a.floor + a.ceiling) / 2))

  const onClockId = draft?.status === 'live' ? drafterAt(draft.order_ids, draft.current_index, draft.crunch) : null
  const onClock = onClockId ? teamById[onClockId] : null
  const isMe = !!(onClock && myTeam && onClock.id === myTeam.id)
  const deadline = draft?.pick_deadline_at ? new Date(draft.pick_deadline_at).getTime() : null
  const secsLeft = deadline ? Math.max(0, Math.ceil((deadline - now.getTime()) / 1000)) : null

  // The clock: whichever tab notices the deadline has passed triggers the random pick (server re-checks).
  const fired = useRef(null)
  useEffect(() => {
    if (!draft || draft.status !== 'live' || !deadline) return
    if (now.getTime() > deadline + 1500 && fired.current !== deadline) {
      fired.current = deadline
      api.autoPick(league.id, week.id).then(reload).catch(() => {})
    }
  }, [now, draft, deadline])

  async function start() { setBusy(true); try { await api.startDraft(league.id, week.id); showToast('Room is open. Clocks are running.'); reload() } catch (e) { showToast(e.message, true) } finally { setBusy(false) } }
  async function pick() { if (!sel) return; setBusy(true); try { await api.makePick(league.id, week.id, sel); setSel(null); showToast(`${coupleById[sel].celeb}. Locked.`); reload() } catch (e) { showToast(e.message, true) } finally { setBusy(false) } }
  async function reset() { if (!confirm('Wipe this week\'s draft and start over?')) return; setBusy(true); try { await api.resetDraft(league.id, week.id); reload() } catch (e) { showToast(e.message, true) } finally { setBusy(false) } }

  const canOpen = isCommissioner || profile?.is_admin || roomOpen

  return (
    <div className="stack" style={{ gap: 20 }}>
      <RideOrDie />

      {/* ---------- PRE ---------- */}
      {phase === 'pre' && (
        <section className="hero">
          <Sparkles n={8} seed={5} />
          <div className="eyebrow">{week.title} · Draft room</div>
          <h1>{roomOpen ? 'Doors are open' : `Doors open in ${fmtCountdown(msToOpen)}`}</h1>
          <p style={{ margin: 0 }}>
            Live snake draft, everyone picks in turn, <b>60 seconds</b> on the clock. If you're not here when it's your turn, the site picks for you, <b>completely at random</b>, from whoever's left. Yes, that could be Guillermo. Show up.
            {' '}{crunch ? <>This week is <b>crunch time</b>: fewer couples than teams, so everyone picks one and duplicates are allowed (points split).</> : <>This week: <b>{roster} pick{roster === 1 ? '' : 's'}</b> each from {alive.length} couples.</>}
          </p>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" disabled={busy || !canOpen} onClick={start}>{isCommissioner ? 'Open the draft room' : roomOpen ? 'Open the draft room' : 'Waiting for the commissioner'}</button>
            <span className="small muted">Scheduled for {fmtET(week.draft_opens_at)}. {isCommissioner ? 'Commissioner can open early.' : 'Anyone can open it once it\'s time.'}</span>
          </div>
        </section>
      )}

      {/* ---------- DRAFTING ---------- */}
      {phase === 'drafting' && draft && (
        <>
          <section className={`hero`} style={isMe ? { background: 'linear-gradient(120deg, var(--pink-soft), var(--gold-soft))', borderColor: 'var(--pink-deep)' } : undefined}>
            {isMe && <Sparkles n={10} seed={9} />}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="eyebrow">{week.title} · Pick {draft.current_index + 1} of {totalPicks(draft)} · Round {draft.crunch ? 1 : Math.floor(draft.current_index / teams.length) + 1}</div>
              <span className="pill live">Live</span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ fontSize: isMe ? 'clamp(2rem, 6vw, 3.2rem)' : undefined }}>{isMe ? "You're on the clock" : <>{onClock?.emoji} {onClock?.name} is on the clock</>}</h1>
                <p style={{ margin: 0 }} className="muted">{isMe ? 'Pick a couple below and lock it in.' : `Waiting on ${members.filter(m => m.team_id === onClock?.id).map(m => m.display_name).join(' & ') || 'them'}. If they're in the bathroom, the site picks for them at zero.`}</p>
              </div>
              <Clock secs={secsLeft} total={draft.pick_seconds} urgent={secsLeft != null && secsLeft <= 10} />
            </div>
          </section>

          <div className="grid draft-grid">
            <section className={`card${isMe ? ' pop' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2>{draft.crunch ? 'Everyone picks one' : 'Available'}</h2>
                <span className="pill">{pool.length} left</span>
              </div>
              {draft.crunch && <p className="small muted">Crunch time: duplicates allowed, and a couple's points are split among everyone who takes them.</p>}
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                {pool.map(c => (
                  <button key={c.id} type="button" disabled={!isMe || busy} onClick={() => setSel(c.id)}
                    className="couple-chip" style={{ cursor: isMe ? 'pointer' : 'default', borderColor: sel === c.id ? 'var(--pink-deep)' : undefined, background: sel === c.id ? 'var(--pink-soft)' : undefined, opacity: isMe ? 1 : 0.8 }}>
                    <span className="av">{initials(c)}</span>
                    <span>{c.celeb} <span className="mono small muted">{avg[c.id] != null ? avg[c.id].toFixed(1) : c.grade}</span></span>
                  </button>
                ))}
              </div>
              {isMe && (
                <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
                  <span className="small">{sel ? <>Taking <b>{coupleById[sel].celeb}</b> & {coupleById[sel].pro}</> : 'Tap a couple.'}</span>
                  <button className="btn" disabled={!sel || busy} onClick={pick}>Lock it in</button>
                </div>
              )}
            </section>

            <section className="card blue">
              <h3>Draft order</h3>
              <ol className="stack" style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', gap: 6 }}>
                {Array.from({ length: totalPicks(draft) }, (_, i) => {
                  const tid = drafterAt(draft.order_ids, i, draft.crunch)
                  const p = weekPicks.find(x => x.pick_number === i + 1)
                  const cur = i === draft.current_index
                  return (
                    <li key={i} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr) minmax(0, 1fr)', gap: 8, alignItems: 'center', padding: '4px 8px', borderRadius: 10, background: cur ? 'var(--pink-soft)' : 'transparent', fontWeight: cur ? 800 : 400 }}>
                      <span className="mono small muted">{i + 1}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teamById[tid]?.emoji} {teamById[tid]?.name}</span>
                      <span className="small" style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p ? <>{coupleById[p.couple_id]?.celeb}{p.auto && ' 🎲'}</> : cur ? '⏱' : ''}</span>
                    </li>
                  )
                })}
              </ol>
              <p className="small muted" style={{ marginTop: 8 }}>🎲 = timer ran out, random pick.</p>
            </section>
          </div>
        </>
      )}

      {/* ---------- DONE ---------- */}
      {(phase === 'window' || phase === 'live' || phase === 'scored') && (
        <section className="hero">
          <div className="eyebrow">{week.title} · Draft complete</div>
          <h1>Rosters are set</h1>
          <p style={{ margin: 0 }}>{phase === 'window' ? <>The trade window is open until {fmtET(week.show_lock_at)}. <a href="#power">Power plays</a> are live.</> : 'Locked for the show.'}</p>
        </section>
      )}

      {/* rosters (any phase once picks exist) */}
      {weekPicks.length > 0 && (
        <section className="card">
          <h2>Rosters</h2>
          <div className="grid three" style={{ marginTop: 10 }}>
            {(draft?.order_ids || teams.map(t => t.id)).map(tid => {
              const t = teamById[tid]; if (!t) return null
              return (
                <div key={tid} className={`card${myTeam?.id === tid ? ' blue' : ''}`} style={{ padding: 14 }}>
                  <TeamName team={t} members={members} small />
                  <div className="row" style={{ marginTop: 8, gap: 6 }}>
                    {weekPicks.filter(p => p.team_id === tid).map(p => <CoupleChip key={p.couple_id} couple={coupleById[p.couple_id]} sniped={p.sniped} shared={p.shared} title={p.auto ? 'Random auto-pick' : `Pick #${p.pick_number}`} />)}
                    {weekPicks.filter(p => p.team_id === tid).some(p => p.auto) && <span className="pill gold">🎲 auto</span>}
                  </div>
                </div>
              )
            })}
          </div>
          {(isCommissioner || profile?.is_admin) && phase !== 'live' && phase !== 'scored' && (
            <div className="row" style={{ marginTop: 12 }}><button className="btn ghost small" disabled={busy} onClick={reset}>Commissioner: wipe and redraft</button></div>
          )}
        </section>
      )}
    </div>
  )
}

function Clock({ secs, total, urgent }) {
  if (secs == null) return null
  const pct = Math.max(0, Math.min(1, secs / total))
  const r = 34, c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0 }} aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 80 80" width="92" height="92" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="40" cy="40" r={r} fill="var(--surface)" stroke="var(--line)" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={urgent ? 'var(--bad)' : 'var(--pink-deep)'} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 0.9s linear' }} />
      </svg>
      <div className="display" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: '1.8rem', color: urgent ? 'var(--bad)' : 'var(--ink)' }}>{secs}</div>
    </div>
  )
}

function RideOrDie() {
  const { api, couples, teams, myTeam, weeks, now, reload, showToast, league } = useData()
  const week1 = weeks[0]
  const open = now.getTime() < new Date(week1.draft_opens_at).getTime()
  const taken = Object.fromEntries(teams.filter(t => t.ride_or_die).map(t => [t.ride_or_die, t]))
  const mine = couples.find(c => c.id === myTeam?.ride_or_die)
  const [choice, setChoice] = useState('')
  if (!myTeam) return null
  async function claim() {
    try { await api.updateTeam(myTeam.id, { ride_or_die: Number(choice) }); showToast('Claimed. No takebacks.'); reload() }
    catch (e) { showToast(/unique|duplicate/i.test(e.message) ? 'Someone claimed them first. Brutal.' : e.message, true) }
  }
  if (!mine && !open) return null
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>💍 Ride or Die</h3>
        <span className="pill gold">+{league.settings?.ride_or_die_weekly ?? 2}/week alive · +{league.settings?.ride_or_die_winner ?? 20} if they win</span>
      </div>
      {mine ? (
        <p>You're riding with <CoupleChip couple={mine} /> {mine.eliminated_week ? <span className="pill out">gone in week {mine.eliminated_week}. RIP.</span> : <span className="muted small">still dancing</span>}</p>
      ) : (
        <div className="row">
          <select value={choice} onChange={e => setChoice(e.target.value)} aria-label="Ride or Die">
            <option value="">Pick your season-long couple…</option>
            {couples.map(c => <option key={c.id} value={c.id} disabled={!!taken[c.id]}>{c.celeb} & {c.pro}{taken[c.id] ? ` — taken by ${taken[c.id].name}` : ''}</option>)}
          </select>
          <button className="btn small blue" disabled={!choice} onClick={claim}>Claim</button>
          <span className="small muted">One per team, first come first served, closes when the week 1 room opens.</span>
        </div>
      )}
    </section>
  )
}
