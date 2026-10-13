// Super Bowl Night: three little football vignettes that play while the draft order is being drawn.
// Pure CSS figures (no logos), driven off `t` (ms since the draft started) so every phone is in sync.
//   0–6s   a Giants back tweaks his knee on a cut
//   6–12s  a Patriots QB gets flattened
//   12–18s a Jets player hoists the trophy, which is the only fictional part

const SCENES = [
  { key: 'giants', caption: 'The Giants back plants his foot and…', outcome: 'Day-to-day. Season-to-season.' },
  { key: 'pats', caption: 'Patriots QB drops back…', outcome: 'SACKED. The dynasty is over, again.' },
  { key: 'jets', caption: 'And the Jets…', outcome: 'HOIST IT. Yes, this is fiction. Yes, it counts.' },
]

export default function FootballShow({ t, sceneMs = 6000 }) {
  const idx = Math.min(SCENES.length - 1, Math.floor(t / sceneMs))
  const local = t - idx * sceneMs
  const scene = SCENES[idx]
  const late = local > sceneMs * 0.55
  return (
    <div className="fb-field" aria-hidden="true">
      <div className="fb-yardlines" />
      {scene.key === 'giants' && <GiantsScene late={late} />}
      {scene.key === 'pats' && <PatsScene late={late} />}
      {scene.key === 'jets' && <JetsScene late={late} />}
      <div className="fb-caption">{late ? scene.outcome : scene.caption}</div>
      <div className="fb-dots">{SCENES.map((s, i) => <span key={s.key} className={i === idx ? 'on' : ''} />)}</div>
    </div>
  )
}

function Player({ jersey, number, className, style, helmet = '#222' }) {
  return (
    <div className={`fb-player ${className || ''}`} style={style}>
      <div className="fb-helmet" style={{ background: helmet }} />
      <div className="fb-jersey" style={{ background: jersey }}><span>{number}</span></div>
      <div className="fb-legs"><i /><i /></div>
    </div>
  )
}

function GiantsScene({ late }) {
  return (
    <>
      <Player jersey="#0B2265" helmet="#0B2265" number="26" className={late ? 'fb-knee' : 'fb-run'} />
      {late && <div className="fb-burst" style={{ left: '48%', bottom: 34 }}>💥 knee</div>}
      {late && <div className="fb-ball fb-ball-drop">🏈</div>}
      {late && <div className="fb-cart">🛺</div>}
    </>
  )
}

function PatsScene({ late }) {
  return (
    <>
      <Player jersey="#C60C30" helmet="#002244" number="12" className={late ? 'fb-flat' : 'fb-dropback'} />
      <Player jersey="#2E7D32" helmet="#1B5E20" number="99" className={late ? 'fb-sack-done' : 'fb-sack'} style={{ left: '78%' }} />
      {late && <div className="fb-burst" style={{ left: '40%', bottom: 60 }}>SACK!</div>}
    </>
  )
}

function JetsScene({ late }) {
  return (
    <>
      <Player jersey="#125740" helmet="#125740" number="8" className={late ? 'fb-hoist' : 'fb-jog'} />
      <div className={`fb-trophy${late ? ' up' : ''}`}>🏆</div>
      {late && <div className="fb-confetti">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ left: `${6 + i * 6.5}%`, animationDelay: `${(i % 5) * 0.18}s` }} />)}</div>}
    </>
  )
}
