import { useState } from 'react'
import { useData, TeamName } from '../ui.jsx'

const EMOJIS = ['🪩', '🕺', '💃', '✨', '🦩', '🍸', '🚨', '👑', '🎺', '🦄', '🔥', '🥂', '🐐', '🎯', '💅', '🫶']

export default function Settings() {
  const { api, user, profile, myTeam, members, league, reload, showToast } = useData()
  const [teamName, setTeamName] = useState(myTeam?.name || '')
  const [emoji, setEmoji] = useState(myTeam?.emoji || '🪩')
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const teammates = members.filter(m => m.team_id === myTeam?.id)

  const run = async (fn, msg) => { setBusy(true); try { await fn(); showToast(msg); reload() } catch (e) { showToast(e.message, true) } finally { setBusy(false) } }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="hero">
        <div className="eyebrow">Settings</div>
        <h1>Your corner of the ballroom</h1>
        <p style={{ margin: 0 }}>Rename the team, pick a better emoji, fix the name you signed up with, change your password. Nothing here affects scores.</p>
      </section>

      <div className="grid two">
        {myTeam && (
          <section className="card pop">
            <h2>Team</h2>
            <p className="small muted">Shared with {teammates.length > 1 ? teammates.filter(m => m.user_id !== user.id).map(m => m.display_name).join(' & ') : 'nobody yet'}. Either of you can change it. Last save wins, which is its own kind of game.</p>
            <form className="stack" onSubmit={e => { e.preventDefault(); run(() => api.updateTeam(myTeam.id, { name: teamName.trim(), emoji }), 'Team updated.') }}>
              <input value={teamName} onChange={e => setTeamName(e.target.value)} required maxLength={40} aria-label="Team name" />
              <div className="row">{EMOJIS.map(e => <button key={e} type="button" className="btn ghost small" style={{ fontSize: '1.2rem', padding: '4px 8px', borderColor: emoji === e ? 'var(--blue-deep)' : undefined, background: emoji === e ? 'var(--blue-soft)' : undefined }} onClick={() => setEmoji(e)}>{e}</button>)}</div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="team"><span className="em">{emoji}</span>{teamName || '…'}</span>
                <button className="btn" disabled={busy || !teamName.trim()}>Save team</button>
              </div>
            </form>
            <p className="small muted" style={{ marginTop: 12 }}>Invite code for {league.name}: <span className="mono">{league.invite_code}</span>. A teammate signs up, enters it, and picks <b>{myTeam.name}</b>.</p>
          </section>
        )}

        <section className="card">
          <h2>You</h2>
          <form className="stack" onSubmit={e => { e.preventDefault(); run(() => api.updateProfile(displayName.trim()), 'Name updated.') }}>
            <label className="small muted">Display name (shows under your team)</label>
            <div className="row">
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} required maxLength={30} aria-label="Display name" style={{ flex: 1 }} />
              <button className="btn small blue" disabled={busy || !displayName.trim()}>Save</button>
            </div>
          </form>
          {!api.isDemo && (
            <>
              <div className="stripe" style={{ margin: '16px 0' }} />
              <form className="stack" onSubmit={e => { e.preventDefault(); if (pw !== pw2) return showToast("Passwords don't match", true); run(async () => { await api.auth.updatePassword(pw); setPw(''); setPw2('') }, 'Password changed.') }}>
                <label className="small muted">New password</label>
                <input type="password" value={pw} onChange={e => setPw(e.target.value)} minLength={6} required placeholder="6+ characters" aria-label="New password" autoComplete="new-password" />
                <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} minLength={6} required placeholder="Same again" aria-label="Confirm password" autoComplete="new-password" />
                <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn small" disabled={busy || pw.length < 6}>Change password</button></div>
              </form>
              <div className="stripe" style={{ margin: '16px 0' }} />
              <form className="stack" onSubmit={e => { e.preventDefault(); run(() => api.auth.updateEmail(email.trim()), 'Email updated. Use the new one next time you sign in.') }}>
                <label className="small muted">Login email</label>
                <div className="row">
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required aria-label="Email" style={{ flex: 1 }} />
                  <button className="btn small ghost" disabled={busy || email === user?.email}>Update</button>
                </div>
              </form>
              <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
                <button className="btn ghost small" type="button" onClick={() => api.auth.signOut()}>Sign out</button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
