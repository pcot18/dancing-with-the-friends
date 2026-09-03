// Auto-fill judges' scores from Wikipedia's season page.
// There is no official DWTS scores API; Wikipedia's "Scoring chart" table is updated by
// editors within an hour or two of every episode, and the MediaWiki API allows anonymous
// CORS (origin=*), so the commissioner's browser can fetch it directly — no server needed.
// It's a preview-then-confirm flow, because the table's formatting drifts season to season.

export const WIKI_PAGE = 'Dancing_with_the_Stars_(American_TV_series)_season_35'

export async function fetchScoringChart(page = WIKI_PAGE) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&formatversion=2&format=json&origin=*`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(json.error.info || 'Wikipedia error')
  return parseScoringChart(json.parse.text)
}

/**
 * @returns {{ weeks: number[], rows: { couple: string, celebFirst: string, proFirst: string, scores: Record<number, {total:number, dances:number, raw:string}> }[] }}
 */
export function parseScoringChart(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const tables = [...doc.querySelectorAll('table.wikitable')]
  // The scoring chart: header row has "Couple" and a run of numeric week headers.
  let best = null
  for (const t of tables) {
    const headRow = t.querySelector('tr')
    if (!headRow) continue
    const heads = [...headRow.children].map(c => c.textContent.trim())
    const weekCols = heads.map((h, i) => ({ h, i })).filter(({ h }) => /^\d{1,2}(\+\d{1,2})?$/.test(h))
    if (heads.some(h => /couple/i.test(h)) && weekCols.length >= 1) { best = { t, heads, weekCols }; break }
  }
  if (!best) throw new Error("Couldn't find the scoring chart on that page. Enter scores by hand this week.")

  const rows = []
  for (const tr of [...best.t.querySelectorAll('tr')].slice(1)) {
    const cells = [...tr.children]
    if (cells.length < 2) continue
    const coupleIdx = best.heads.findIndex(h => /couple/i.test(h))
    const couple = cells[coupleIdx]?.textContent.replace(/\[.*?\]/g, '').trim()
    if (!couple || !/&|and/i.test(couple)) continue
    const [celebFirst, proFirst] = couple.split(/\s*(?:&|and)\s*/).map(s => (s || '').trim().split(/\s+/)[0])
    const scores = {}
    // header cells may be th; data cells shift when rowspans exist, so map by header index
    best.weekCols.forEach(({ h, i }) => {
      const cell = cells[i]; if (!cell) return
      const raw = cell.textContent.replace(/\[.*?\]/g, '').trim()
      const parsed = parseCell(raw)
      if (parsed) scores[parseInt(h, 10)] = { ...parsed, raw }
    })
    rows.push({ couple, celebFirst, proFirst, scores })
  }
  return { weeks: best.weekCols.map(w => parseInt(w.h, 10)), rows }
}

// "24" → 24 · "27+28=55" → 55 (2 dances) · "27 28" → 55 · "—" → null
export function parseCell(text) {
  if (!text || /^[—–-]$/.test(text)) return null
  const nums = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number)
  if (!nums.length) return null
  if (text.includes('=')) return { total: nums[nums.length - 1], dances: nums.length - 1 }
  if (nums.length > 1) return { total: nums.reduce((a, b) => a + b, 0), dances: nums.length }
  return { total: nums[0], dances: 1 }
}

/** Match a Wikipedia row to a couple in our table by celeb + pro first names. */
export function matchCouple(row, couples) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '')
  return couples.find(c => norm(c.celeb.split(' ')[0]) === norm(row.celebFirst) && norm(c.pro.split(' ')[0]) === norm(row.proFirst))
    || couples.find(c => norm(c.celeb.split(' ')[0]) === norm(row.celebFirst))
    || null
}
