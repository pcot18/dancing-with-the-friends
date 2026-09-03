import { useState } from 'react'
import { api } from '../lib/api.js'
import { Sparkles } from '../ui.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState(null)
  async function go(e) {
    e.preventDefault(); setErr(null)
    try { await api.auth.signIn(email.trim()); setSent(true) } catch (ex) { setErr(ex.message) }
  }
  return (
    <div className="login">
      <div className="card pop" style={{ overflow: 'hidden' }}>
        <Sparkles n={6} seed={7} />
        <div className="eyebrow">Season 35 · Fantasy Ballroom</div>
        <h1 style={{ fontSize: '2.4rem', marginTop: 6 }}>Dancing with the Friends 🪩</h1>
        <p className="muted">No passwords. We email you a link, you tap it, you're in. Like a magic trick, but for people who can't do the cha-cha.</p>
        {sent ? (
          <div className="card blue"><b>Check your email.</b> Your login link is on its way to {email}. It expires in an hour, which is longer than most Bachelor relationships.</div>
        ) : (
          <form onSubmit={go} className="stack">
            <input type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
            {err && <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>}
            <button className="btn" type="submit">Send me a login link</button>
          </form>
        )}
        <p className="small muted" style={{ marginTop: 14 }}>Want to poke around first? <a href="?demo">Open the demo league</a>.</p>
      </div>
    </div>
  )
}
