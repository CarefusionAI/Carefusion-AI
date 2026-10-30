// Small SVG charts drawn from real series (BP, sugar, weight). No chart library.
// Colours match the design tokens: teal #3a726d, gold #c9a86a, soft teal #86bdb8, sage #dcebe0.

interface Pt {
  x: number
  y: number
}

/** Smooth path through points (Catmull-Rom converted to cubic Beziers). */
function smooth(pts: Pt[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${pts[0]!.x} ${pts[0]!.y}`
  let d = `M${r(pts[0]!.x)} ${r(pts[0]!.y)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(p2.x)} ${r(p2.y)}`
  }
  return d
}

function r(n: number): number {
  return Math.round(n * 10) / 10
}

function extent(values: number[], pad = 0.1, floor?: number): [number, number] {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || Math.max(1, hi * 0.05)
  const min = floor !== undefined ? Math.min(floor, lo - span * pad) : lo - span * pad
  return [min, hi + span * pad]
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(d)
}

export interface TimePoint {
  measuredAt: string
  value: number
}

/** Single series with a filled area and a dot on the latest value (Home BP card, weight card). */
export function TrendChart({
  points,
  label,
  width = 300,
  height = 110,
}: {
  points: TimePoint[]
  label: string
  width?: number
  height?: number
}) {
  if (points.length === 0) return null
  const [min, max] = extent(points.map((p) => p.value), 0.15)
  const t0 = new Date(points[0]!.measuredAt).getTime()
  const t1 = new Date(points[points.length - 1]!.measuredAt).getTime()
  const spanT = t1 - t0 || 1
  const padY = 8
  const pts: Pt[] = points.map((p) => ({
    x: points.length === 1 ? width : ((new Date(p.measuredAt).getTime() - t0) / spanT) * width,
    y: padY + (1 - (p.value - min) / (max - min || 1)) * (height - padY * 2),
  }))
  const line = smooth(pts)
  const last = pts[pts.length - 1]!
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="c1-chart">
      <path d={`M0 ${height * 0.18} H${width} M0 ${height * 0.5} H${width} M0 ${height * 0.82} H${width}`} stroke="#e4ddd6" strokeWidth="1" />
      <path d={line} fill="none" stroke="#3a726d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`${line} L${last.x} ${height} L${pts[0]!.x} ${height}Z`} fill="#86bdb8" opacity=".18" />
      <circle cx={last.x} cy={last.y} r="4" fill="#3a726d" />
    </svg>
  )
}

export interface BpPoint {
  measuredAt: string
  systolic: number
  diastolic: number
}

/** Systolic and diastolic lines over a shaded target band (Home vitals, 30 days). */
export function BpChart({
  points,
  target,
  label,
}: {
  points: BpPoint[]
  target: { sysLow: number; sysHigh: number } | null
  label: string
}) {
  const W = 420
  const H = 200
  const left = 30
  const top = 14
  const bottom = 26
  const innerW = W - left
  const innerH = H - top - bottom
  if (points.length === 0) return null
  const all = [...points.map((p) => p.systolic), ...points.map((p) => p.diastolic)]
  if (target) all.push(target.sysLow, target.sysHigh)
  const lo = Math.floor((Math.min(...all) - 4) / 10) * 10
  const hi = Math.ceil((Math.max(...all) + 4) / 10) * 10
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo || 1)) * innerH
  const t0 = new Date(points[0]!.measuredAt).getTime()
  const t1 = new Date(points[points.length - 1]!.measuredAt).getTime()
  const spanT = t1 - t0 || 1
  const x = (iso: string) => (points.length === 1 ? W : left + ((new Date(iso).getTime() - t0) / spanT) * innerW)
  const sys = points.map((p) => ({ x: x(p.measuredAt), y: y(p.systolic) }))
  const dia = points.map((p) => ({ x: x(p.measuredAt), y: y(p.diastolic) }))
  const ticks: number[] = []
  for (let v = lo; v <= hi; v += 20) ticks.push(v)
  const mid = points[Math.floor(points.length / 2)]!
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="c1-chart">
      {target ? (
        <rect x={left} y={y(target.sysHigh)} width={innerW} height={Math.max(2, y(target.sysLow) - y(target.sysHigh))} fill="#dcebe0" opacity=".55" rx="6" />
      ) : null}
      <g stroke="#e4ddd6">
        {ticks.map((v) => (
          <path key={v} d={`M${left} ${y(v)}H${W}`} />
        ))}
      </g>
      <g fill="#586470" fontSize="10" fontFamily="IBM Plex Sans">
        {ticks.map((v) => (
          <text key={v} x="0" y={y(v) + 4}>
            {v}
          </text>
        ))}
      </g>
      <path className="c1-draw" d={smooth(sys)} fill="none" stroke="#3a726d" strokeWidth="2.5" strokeLinecap="round" />
      <path className="c1-draw" d={smooth(dia)} fill="none" stroke="#c9a86a" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={sys[sys.length - 1]!.x} cy={sys[sys.length - 1]!.y} r="4" fill="#3a726d" />
      <circle cx={dia[dia.length - 1]!.x} cy={dia[dia.length - 1]!.y} r="4" fill="#c9a86a" />
      <g fill="#586470" fontSize="10" fontFamily="IBM Plex Sans">
        <text x={left} y={H - 2}>
          {dayLabel(points[0]!.measuredAt)}
        </text>
        <text x={x(mid.measuredAt) - 12} y={H - 2}>
          {dayLabel(mid.measuredAt)}
        </text>
        <text x={W - 34} y={H - 2}>
          Latest
        </text>
      </g>
    </svg>
  )
}

/** Bars for weekly readings (fasting sugar), with an optional dashed target line. */
export function BarsChart({
  points,
  target,
  label,
}: {
  points: TimePoint[]
  target: number | null
  label: string
}) {
  const W = 300
  const H = 120
  if (points.length === 0) return null
  const vals = points.map((p) => p.value)
  if (target !== null) vals.push(target)
  const max = Math.max(...vals) * 1.05
  const min = Math.min(...vals) * 0.7
  const gap = 8
  const bw = (W - gap * (points.length - 1)) / points.length
  const h = (v: number) => 14 + ((v - min) / (max - min || 1)) * (H - 20)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="c1-chart">
      {target !== null ? <path d={`M0 ${H - h(target)}H${W}`} stroke="#e7c58e" strokeDasharray="4 4" /> : null}
      {points.map((p, i) => (
        <rect
          key={p.measuredAt}
          x={i * (bw + gap)}
          y={H - h(p.value)}
          width={bw}
          height={h(p.value)}
          rx="6"
          fill={i === points.length - 1 ? '#3a726d' : '#86bdb8'}
        >
          <title>{`${dayLabel(p.measuredAt)}: ${p.value}`}</title>
        </rect>
      ))}
    </svg>
  )
}
