import { useEffect, useState, createContext, useContext } from 'react'
import { api } from './lib/api.js'

export const DataCtx = createContext(null)
export const useData = () => useContext(DataCtx)

export function initials(c) { return c.celeb.split(' ').map(s => s[0]).join('').slice(0, 2) }

export function CoupleChip({ couple, out, sniped, shared, title }) {
  if (!couple) return null
  return (
    <span className={`couple-chip${out || couple.eliminated_week ? ' out' : ''}${sniped ? ' sniped' : ''}`} title={title || `${couple.celeb} & ${couple.pro}`}>
      <span className="av">{initials(couple)}</span>
      {couple.celeb}{sniped && ' 🎯'}{shared && ' 🤝'}
    </span>
  )
}

export function TeamName({ team, members, small }) {
  const who = (members || []).filter(m => m.team_id === team.id).map(m => m.display_name).join(' & ')
  return <span className="team"><span className="em">{team.emoji}</span><span>{team.name}{!small && who && <div className="who">{who}</div>}</span></span>
}

export function Sparkles({ n = 7, seed = 1 }) {
  const pts = []
  let s = seed
  for (let i = 0; i < n; i++) { s = (s * 9301 + 49297) % 233280; const x = s / 233280; s = (s * 9301 + 49297) % 233280; const y = s / 233280
    pts.push(<span key={i} className="sparkle" aria-hidden="true" style={{ left: `${5 + x * 90}%`, top: `${5 + y * 80}%`, animationDelay: `${(x * 2.4).toFixed(2)}s`, fontSize: `${0.7 + y * 0.9}rem` }}>✦</span>) }
  return <>{pts}</>
}

export function useNow(tick = 1000) {
  const [now, setNow] = useState(() => api.now())
  useEffect(() => { const id = setInterval(() => setNow(api.now()), tick); return () => clearInterval(id) }, [tick])
  return now
}

export function fmtCountdown(ms) {
  if (ms <= 0) return 'now'
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s % 60}s`
}

export function fmtET(iso) {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'
}

export function Toast({ toast }) {
  if (!toast) return null
  return <div className={`toast${toast.err ? ' err' : ''}`} role="status">{toast.msg}</div>
}

export function useToast() {
  const [toast, setToast] = useState(null)
  const show = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3200) }
  return [toast, show]
}

export function fmtPts(n) { return (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) }

/**
 * Which week is "current" and what phase it's in. Nothing here is tied to the clock:
 * the current week is the earliest week without judges' scores, and the phase comes from state.
 * pre      → no draft yet (commissioner starts it whenever)
 * drafting → live draft in progress
 * window   → draft done, scores not in: snipes open
 * scored   → season complete
 */
export function currentWeekInfo(weeks, scores, drafts, now) {
  const t = now.getTime()
  const scored = new Set(scores.map(s => s.week_id))
  const week = weeks.find(w => !scored.has(w.id)) || weeks[weeks.length - 1]
  const draft = (drafts || []).find(d => d.week_id === week.id) || null
  const opens = new Date(week.draft_opens_at).getTime(), sl = new Date(week.show_lock_at).getTime()
  let phase
  if (scored.has(week.id)) phase = 'scored'
  else if (draft?.status === 'done') phase = 'window'
  else if (draft?.status === 'live') phase = 'drafting'
  else phase = 'pre'
  return { week, phase, draft, msToOpen: opens - t, msToShowLock: sl - t, roomOpen: t >= opens }
}
