import { useState } from 'react'
import { api } from '../lib/api.js'
import { Sparkles } from '../ui.jsx'

const EMOJIS = ['🪩', '🕺', '💃', '✨', '🦩', '🍸', '🚨', '👑', '🎺', '🦄', '🔥', '🥂']

export default function JoinLeague({ onJoined }) {
  const [mode, setMode] = useState('join')
  const [code, setCode] = useState('')
  const [teams, setTeams] = useState(null)
  const [teamName, setTeamName] = useState('')
  const [leagueName, setLeagueName] = useState('')
  const [emoji, setEmoji] = useState('🪩')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  async function lookup(e) { e.preventDefault(); setErr(null); setBusy(true)
    try { const t = await api.teamsForCode(code); if (!t.length) throw new Error('No league with that code'); setTeams(t) } catch (ex) { setErr(ex.message) } finally { setBusy(false) } }
  async function join(teamId) { setBusy(true); setErr(null)
    try { onJoined(await api.joinLeague(code, teamId, teamId ? null : teamName, emoji)) } catch (ex) { setErr(ex.message) } finally { setBusy(false) } }
  async function create(e) { e.preventDefault(); setBusy(true); setErr(null)
    try { onJoined(await api.createLeague(leagueName, teamName, emoji)) } catch (ex) { setErr(ex.message) } finally { setBusy(false) } }

  const EmojiPick = () => <div className="row">{EMOJIS.map(e => <button key={e} type="button" className={`btn ghost small${emoji === e ? ' blue' : ''}`} style={{ fontSize: '1.2rem', padding: '4px 8px', borderColor: emoji === e ? 'var(--blue-deep)' : undefined }} onClick={() => setEmoji(e)}>{e}</button>)}</div>

  return (
    <div className="login">
      <div className="card pop" style={{ overflow: 'hidden', maxWidth: 520 }}>
        <Sparkles n={5} seed={3} />
        <h1 style={{ fontSize: '2rem' }}>Find your people</h1>
        <div className="row" style={{ margin: '12px 0' }}>
          <button className={`btn small${mode === 'join' ? '' : ' ghost'}`} onClick={() => setMode('join')}>I have a code</button>
          <button className={`btn small${mode === 'create' ? '' : ' ghost'}`} onClick={() => setMode('create')}>Start a league</button>
        </div>
        {err && <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>}
        {mode === 'join' && !teams && (
          <form onSubmit={lookup} className="stack">
            <input placeholder="Invite code (e.g. SEQUIN)" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required aria-label="Invite code" />
            <button className="btn" disabled={busy}>Look it up</button>
          </form>
        )}
        {mode === 'join' && teams && (
          <div className="stack">
            <div className="eyebrow">{teams[0].league_name}</div>
            <p className="small muted">Joining a couple? Pick their team. Flying solo? Make a new one.</p>
            {teams.map(t => <button key={t.id} className="btn ghost" onClick={() => join(t.id)} disabled={busy} style={{ textAlign: 'left' }}>{t.emoji} Join <b>{t.name}</b> <span className="muted small">({t.member_count} so far)</span></button>)}
            <div className="stripe" />
            <input placeholder="New team name" value={teamName} onChange={e => setTeamName(e.target.value)} aria-label="Team name" />
            <EmojiPick />
            <button className="btn blue" disabled={busy || !teamName} onClick={() => join(null)}>Create my team</button>
          </div>
        )}
        {mode === 'create' && (
          <form onSubmit={create} className="stack">
            <input placeholder="League name (e.g. Tuesday Night Ballroom Crimes)" value={leagueName} onChange={e => setLeagueName(e.target.value)} required aria-label="League name" />
            <input placeholder="Your team name" value={teamName} onChange={e => setTeamName(e.target.value)} required aria-label="Team name" />
            <EmojiPick />
            <button className="btn" disabled={busy}>Create league</button>
            <p className="small muted">You'll be the commissioner: you enter the scores, you settle the arguments, you're never wrong.</p>
          </form>
        )}
      </div>
    </div>
  )
}
