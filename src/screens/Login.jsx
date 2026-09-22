import { useState } from 'react'
import { api } from '../lib/api.js'
import { Sparkles } from '../ui.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  async function go(e) {
    e.preventDefault(); setErr(null); setBusy(true)
    try { await api.auth.signIn(email.trim(), password) } catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }
  return (
    <div className="login">
      <div className="card pop" style={{ overflow: 'hidden' }}>
        <Sparkles n={6} seed={7} />
        <div className="eyebrow">Season 35 · Fantasy Ballroom</div>
        <h1 style={{ fontSize: '2.4rem', marginTop: 6 }}>Dancing with the Friends 🪩</h1>
        <p className="muted">Email and a password. First time in? Same form, it makes your account on the spot. Share a login with your partner or each make one and join the same team, either works.</p>
        <form onSubmit={go} className="stack">
          <input type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" autoComplete="email" />
          <input type="password" required minLength={6} placeholder="Password (6+ characters, nothing precious)" value={password} onChange={e => setPassword(e.target.value)} aria-label="Password" autoComplete="current-password" />
          {err && <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>}
          <button className="btn" type="submit" disabled={busy}>{busy ? 'One sec…' : 'Get in the ballroom'}</button>
        </form>
        <p className="small muted" style={{ marginTop: 14 }}>Want to poke around first? <a href="?demo">Open the demo league</a>.</p>
      </div>
    </div>
  )
}
