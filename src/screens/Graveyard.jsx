// Dedication Night: tombstones everywhere, and a zombie hand claws out of the dirt when a team is called.
// Pure CSS (see .gy-* and .zh-* in styles.css); no images.

// Epitaphs: the couples already sent home get their own stones, padded with league in-jokes.
const FILLER = ['RIP the lift rule', 'Here lies a 7 from Bruno', 'Gone, like the snipe window', 'RIP Taylor\'s vote total', 'In loving memory of 60 seconds', 'RIP Ride or Die', 'Here lies "I\'ll pick next time"', 'Beloved. Undrafted.']

export function Tombstones({ couples = [], count = 8, strip = false }) {
  const gone = couples.filter(c => c.eliminated_week != null).sort((a, b) => a.eliminated_week - b.eliminated_week)
  const lines = [...gone.map(c => ({ top: 'RIP', name: c.celeb.split(' ')[0], sub: `wk ${c.eliminated_week}` })), ...FILLER.map(f => ({ top: 'RIP', name: f, sub: '' }))].slice(0, count)
  return (
    <div className={`gy-field${strip ? ' strip' : ''}`} aria-hidden="true">
      {lines.map((l, i) => (
        <div key={i} className="gy-stone" style={{ '--i': i, '--h': `${54 + (i * 37) % 26}px`, '--tilt': `${((i * 53) % 9) - 4}deg` }}>
          <span className="gy-top">{l.top}</span>
          <span className="gy-name">{l.name}</span>
          {l.sub && <span className="gy-sub">{l.sub}</span>}
          <i className="gy-grass" />
        </div>
      ))}
      <div className="gy-fog" />
    </div>
  )
}

export function ZombieHand() {
  return (
    <span className="zh" aria-hidden="true">
      <i className="zh-dirt" /><i className="zh-dirt" /><i className="zh-dirt" />
      <span className="zh-arm">
        <span className="zh-palm">
          <i className="zh-f" /><i className="zh-f" /><i className="zh-f" /><i className="zh-f" /><i className="zh-thumb" />
        </span>
      </span>
      <span className="zh-mound" />
    </span>
  )
}
