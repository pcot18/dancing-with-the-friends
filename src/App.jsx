import { useEffect, useMemo, useState } from 'react'
import { api } from './lib/api.js'
import { computeStandings } from './lib/scoring.js'
import { DataCtx, Sparkles, Toast, useToast, useNow, currentWeekInfo, fmtPts } from './ui.jsx'
import Board from './screens/Board.jsx'
import Picks from './screens/Picks.jsx'
import PowerPlays from './screens/PowerPlays.jsx'
import Cast from './screens/Cast.jsx'
import Recap from './screens/Recap.jsx'
import Commish from './screens/Commish.jsx'
import Login from './screens/Login.jsx'
import JoinLeague from './screens/JoinLeague.jsx'

const TABS = [['board', 'Board'], ['picks', 'My Picks'], ['power', 'Power Plays'], ['cast', 'Cast'], ['recap', 'Recaps']]

function tabFromHash() { return (location.hash.replace('#', '') || 'board').split('/')[0] }

export default function App() {
  const [user, setUser] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [season, setSeason] = useState(null)
  const [leagueData, setLeagueData] = useState(null)
  const [leagueId, setLeagueId] = useState(() => { try { return localStorage.getItem('dwtf.league') || null } catch { return null } })
  const [tab, setTab] = useState(tabFromHash)
  const [toast, showToast] = useToast()
  const [error, setError] = useState(null)
  const now = useNow()

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    addEventListener('hashchange', onHash); return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    api.auth.getUser().then(setUser)
    return api.auth.onChange(setUser)
  }, [])

  async function reload() {
    try {
      setError(null)
      const [s, p] = await Promise.all([api.loadSeason(), api.getProfile()])
      setSeason(s); setProfile(p)
      let lid = leagueId
      if (!lid) { const ls = await api.loadMyLeagues(); lid = ls[0]?.id || null; if (lid) { setLeagueId(lid); try { localStorage.setItem('dwtf.league', lid) } catch {} } }
      if (lid) setLeagueData(await api.loadLeague(lid))
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { if (user) reload() }, [user, leagueId])

  const standings = useMemo(() => season && leagueData ? computeStandings({ season: season.season, league: leagueData.league, teams: leagueData.teams, weeks: season.weeks, scores: season.scores, picks: leagueData.picks, powerPlays: leagueData.powerPlays, couples: season.couples }) : null, [season, leagueData])
  const weekInfo = useMemo(() => season ? currentWeekInfo(season.weeks, season.scores, now) : null, [season, now])

  if (user === undefined) return <div className="login"><div className="display" style={{ fontSize: '2rem' }}>Warming up… 🪩</div></div>
  if (!user) return <Login />
  if (error) return <div className="page"><div className="card pop"><h2>Something tripped</h2><p>{error}</p><button className="btn" onClick={reload}>Try again</button></div></div>
  if (!season) return <div className="login"><div className="display" style={{ fontSize: '2rem' }}>Cueing the music… 🎶</div></div>
  if (!leagueData) return <JoinLeague onJoined={(id) => { setLeagueId(id); try { localStorage.setItem('dwtf.league', id) } catch {} }} season={season} />

  const ctx = { api, user, profile, ...season, ...leagueData, standings, weekInfo, now, reload, showToast }
  const isCommish = leagueData.isCommissioner || profile?.is_admin
  const leader = standings.ranked[0]
  const tickerItems = [
    `${leagueData.league.name}`,
    leader ? `LEADER ${leader.team.emoji} ${leader.team.name} · ${fmtPts(leader.total)} pts` : 'No scores yet',
    ...standings.ranked.slice(1).map(l => `${l.team.emoji} ${l.team.name} −${fmtPts(l.behind)}`),
    weekInfo.phase === 'ranking' ? `RANKINGS LOCK ${new Date(weekInfo.week.rankings_lock_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', timeZone: 'America/New_York' })} ET` : weekInfo.phase === 'window' ? `TRADE WINDOW OPEN · ${weekInfo.week.title}` : `${weekInfo.week.title} · LIVE`,
    `${season.couples.filter(c => !c.eliminated_week).length} couples still dancing`,
    api.isDemo ? 'DEMO MODE · fake scores, fake friends, real feelings' : '',
  ].filter(Boolean)

  const Screen = { board: Board, picks: Picks, power: PowerPlays, cast: Cast, recap: Recap, commish: Commish }[tab] || Board

  return (
    <DataCtx.Provider value={ctx}>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="wordmark" href="#board"><span className="ball">🪩</span><span className="display">Dancing with the Friends</span></a>
          <nav className="tabs" aria-label="Sections">
            {TABS.map(([k, label]) => <a key={k} href={`#${k}`} className={`tab${tab === k ? ' active' : ''}`} style={{ textDecoration: 'none' }}>{label}</a>)}
            {isCommish && <a href="#commish" className={`tab${tab === 'commish' ? ' active' : ''}`} style={{ textDecoration: 'none' }}>Commish</a>}
            {!api.isDemo && <button className="tab" onClick={() => api.auth.signOut()}>Sign out</button>}
          </nav>
        </div>
        <div className="ticker" aria-hidden="true"><div className="ticker-inner">{[...tickerItems, ...tickerItems].map((t, i) => <span key={i}><b>◆</b> {t}</span>)}</div></div>
      </header>
      <main className="page"><Screen /></main>
      <Toast toast={toast} />
    </DataCtx.Provider>
  )
}
