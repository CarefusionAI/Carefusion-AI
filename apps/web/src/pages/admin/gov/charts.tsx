import { useId } from 'react'
import type { ReactNode } from 'react'

// Accessible SVG charts. Rules used everywhere here:
// - role="img" with a plain-language label, plus a visually hidden data table for screen readers
// - colour is never the only cue: series differ by dash and marker, bars carry values, status has a word
// - a missing number (null, or hidden by the small-cell rule) is drawn as a hatched stub, never as zero

export const C = {
  ink: '#3f5263',
  muted: '#586470',
  grid: '#e4ddd6',
  teal: '#3a726d',
  tealSoft: '#86bdb8',
  rose: '#9a4a46',
  roseSoft: '#e3a9a3',
  gold: '#8a6a1f',
  goldSoft: '#e7c58e',
  purple: '#6a5a8c',
  purpleSoft: '#b7a6d4',
  blue: '#45658a',
  base: '#857c74',
  ok: '#376a4f',
  warn: '#7e5820',
}

/** Three line styles that stay apart for colour-blind readers (colour + dash + marker). */
export const LINE_STYLES = [
  { color: C.rose, dash: undefined as string | undefined, marker: 'circle' as const },
  { color: C.gold, dash: '7 4', marker: 'square' as const },
  { color: C.purple, dash: '2 4', marker: 'diamond' as const },
]

function SrTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: (string | number | null)[][] }) {
  return (
    <table className="cf-sr">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c === null ? 'hidden or not reported' : c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Marker({ kind, x, y, color, r = 3.5 }: { kind: 'circle' | 'square' | 'diamond'; x: number; y: number; color: string; r?: number }) {
  if (kind === 'square') return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill={color} />
  if (kind === 'diamond') return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}`} fill={color} />
  return <circle cx={x} cy={y} r={r} fill={color} />
}

export function LegendMarker({ kind, color, dash }: { kind: 'circle' | 'square' | 'diamond' | 'bar'; color: string; dash?: string }) {
  return (
    <svg width="26" height="12" aria-hidden="true">
      {kind === 'bar' ? (
        <rect x="4" y="1" width="18" height="10" rx="2" fill={color} />
      ) : (
        <>
          <line x1="0" y1="6" x2="26" y2="6" stroke={color} strokeWidth="2" strokeDasharray={dash} />
          <Marker kind={kind} x={13} y={6} color={color} r={3} />
        </>
      )}
    </svg>
  )
}

function Hatch({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="#faf5ef" />
        <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="2" />
      </pattern>
    </defs>
  )
}

// ---------------------------------------------------------------- line chart

export interface LineSeries {
  name: string
  points: (number | null)[]
  color?: string
  dash?: string
  marker?: 'circle' | 'square' | 'diamond'
}

export function LineChart({
  series,
  xLabels,
  label,
  height = 150,
  normalise,
  area,
  endLabel,
  yTicks = true,
  legend = true,
}: {
  series: LineSeries[]
  xLabels: string[]
  label: string
  height?: number
  /** Scale every line to its own peak (used when units differ a lot). */
  normalise?: boolean
  area?: boolean
  endLabel?: string
  yTicks?: boolean
  legend?: boolean
}) {
  const W = 480
  const pad = { l: normalise || !yTicks ? 6 : 36, r: 8, t: 10, b: 26 }
  const iw = W - pad.l - pad.r
  const ih = height - pad.t - pad.b
  const n = Math.max(1, xLabels.length)
  const maxes = series.map((s) => Math.max(1, ...s.points.map((p) => p ?? 0)))
  const gMax = Math.max(...maxes)
  const x = (i: number) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v: number, si: number) => pad.t + ih - (v / (normalise ? (maxes[si] ?? 1) : gMax)) * ih
  const styled = series.map((s, i) => {
    const d = LINE_STYLES[i % LINE_STYLES.length]!
    return { name: s.name, points: s.points, color: s.color ?? d.color, dash: s.dash ?? d.dash, marker: s.marker ?? d.marker }
  })

  return (
    <figure style={{ margin: 0 }}>
      <svg className="gv-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
        <title>{label}</title>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih - f * ih} y2={pad.t + ih - f * ih} stroke={C.grid} />
            {yTicks && !normalise ? (
              <text x={pad.l - 6} y={pad.t + ih - f * ih + 4} textAnchor="end">
                {Math.round(gMax * f).toLocaleString('en-IN')}
              </text>
            ) : null}
          </g>
        ))}
        {styled.map((s, si) => {
          const pts = s.points.map((p, i) => (p === null ? null : ([x(i), y(p, si)] as const)))
          const segs: string[] = []
          let cur = ''
          pts.forEach((p) => {
            if (!p) {
              if (cur) segs.push(cur)
              cur = ''
            } else cur += `${cur ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`
          })
          if (cur) segs.push(cur)
          const first = pts.find(Boolean)
          const last = [...pts].reverse().find(Boolean)
          return (
            <g key={s.name}>
              {area && first && last && series.length === 1 ? (
                <path d={`${segs[0] ?? ''}L${last[0]},${pad.t + ih}L${first[0]},${pad.t + ih}Z`} fill={s.color} opacity="0.14" />
              ) : null}
              {segs.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={s.color} strokeWidth="2.2" strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {last ? <Marker kind={s.marker} x={last[0]} y={last[1]} color={s.color} /> : null}
            </g>
          )
        })}
        {xLabels.map((l, i) =>
          i === 0 || i === n - 1 || (n > 6 && i === Math.floor((n - 1) / 2)) ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
              {l}
            </text>
          ) : null,
        )}
        {endLabel ? (
          <text x={W / 2} y={height - 8} textAnchor="middle" className="gv-ct-strong">
            {endLabel}
          </text>
        ) : null}
      </svg>
      {legend ? (
        <figcaption className="gv-chart-legend">
          {styled.map((s) => (
            <span key={s.name}>
              <LegendMarker kind={s.marker} color={s.color} dash={s.dash} />
              {s.name}
            </span>
          ))}
          {normalise ? <span>Each line is scaled to its own peak</span> : null}
        </figcaption>
      ) : null}
      <SrTable
        caption={label}
        headers={['Period', ...series.map((s) => s.name)]}
        rows={xLabels.map((l, i) => [l, ...series.map((s) => s.points[i] ?? null)])}
      />
    </figure>
  )
}

// ---------------------------------------------------------------- bar chart (with optional baseline and target)

export interface BarItem {
  label: string
  value: number | null
  highlight?: boolean
  /** Text shown for a hidden value, for example "<5". */
  hiddenText?: string
}

export function BarChart({
  items,
  label,
  height = 170,
  color = C.roseSoft,
  highlightColor = C.rose,
  baseline,
  baselineName = 'Baseline',
  target,
  yMax,
  labelEvery = 3,
  showAllValues,
  valueName = 'Value',
  yFormat,
  legend,
}: {
  items: BarItem[]
  label: string
  height?: number
  color?: string
  highlightColor?: string
  baseline?: (number | null)[]
  baselineName?: string
  target?: { value: number; label: string }
  yMax?: number
  labelEvery?: number
  showAllValues?: boolean
  valueName?: string
  yFormat?: (n: number) => string
  legend?: ReactNode
}) {
  const uid = useId().replace(/:/g, '')
  const W = 480
  const pad = { l: 34, r: 6, t: 14, b: 26 }
  const iw = W - pad.l - pad.r
  const ih = height - pad.t - pad.b
  const n = Math.max(1, items.length)
  const vals = items.map((i) => i.value ?? 0)
  const max = Math.max(1, yMax ?? 0, ...vals, ...(baseline ?? []).map((b) => b ?? 0), target?.value ?? 0)
  const slot = iw / n
  const bw = Math.min(slot * 0.68, 34)
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const fmt = yFormat ?? ((v: number) => Math.round(v).toLocaleString('en-IN'))

  const basePts = (baseline ?? []).map((b, i) => (b === null || b === undefined ? null : ([pad.l + slot * i + slot / 2, y(b)] as const)))
  const baseSegs: string[] = []
  let cur = ''
  basePts.forEach((p) => {
    if (!p) {
      if (cur) baseSegs.push(cur)
      cur = ''
    } else cur += `${cur ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`
  })
  if (cur) baseSegs.push(cur)

  return (
    <figure style={{ margin: 0 }}>
      <svg className="gv-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
        <title>{label}</title>
        <Hatch id={`h-${uid}`} color={C.base} />
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih - f * ih} y2={pad.t + ih - f * ih} stroke={C.grid} />
            <text x={pad.l - 6} y={pad.t + ih - f * ih + 4} textAnchor="end">
              {fmt(max * f)}
            </text>
          </g>
        ))}
        {items.map((it, i) => {
          const cx = pad.l + slot * i + slot / 2
          const hidden = it.value === null
          const h = hidden ? 14 : Math.max(2, (it.value! / max) * ih)
          return (
            <g key={i}>
              <rect
                x={cx - bw / 2}
                y={pad.t + ih - h}
                width={bw}
                height={h}
                rx="3"
                fill={hidden ? `url(#h-${uid})` : it.highlight ? highlightColor : color}
                stroke={hidden ? C.base : it.highlight ? highlightColor : 'none'}
                strokeWidth={hidden ? 1 : 0}
              />
              {hidden ? (
                <text x={cx} y={pad.t + ih - h - 3} textAnchor="middle">
                  {it.hiddenText ?? '<5'}
                </text>
              ) : showAllValues || it.highlight ? (
                <text x={cx} y={pad.t + ih - h - 4} textAnchor="middle" className="gv-ct-strong">
                  {fmt(it.value!)}
                </text>
              ) : null}
              {i % labelEvery === 0 || i === n - 1 ? (
                <text x={cx} y={height - 8} textAnchor="middle">
                  {it.label}
                </text>
              ) : null}
            </g>
          )
        })}
        {baseSegs.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={C.ink} strokeWidth="2" strokeDasharray="5 4" />
        ))}
        {target ? (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(target.value)} y2={y(target.value)} stroke={C.ink} strokeDasharray="5 4" strokeWidth="1.5" />
            <text x={W - pad.r} y={y(target.value) - 4} textAnchor="end" className="gv-ct-strong">
              {target.label}
            </text>
          </g>
        ) : null}
      </svg>
      {legend ?? (
        <figcaption className="gv-chart-legend">
          <span>
            <LegendMarker kind="bar" color={highlightColor} />
            {valueName}
          </span>
          {baseline ? (
            <span>
              <LegendMarker kind="circle" color={C.ink} dash="5 4" />
              {baselineName}
            </span>
          ) : null}
        </figcaption>
      )}
      <SrTable
        caption={label}
        headers={['Period', valueName, ...(baseline ? [baselineName] : [])]}
        rows={items.map((it, i) => [it.label, it.value === null ? null : it.value, ...(baseline ? [baseline[i] ?? null] : [])])}
      />
    </figure>
  )
}

// ---------------------------------------------------------------- stacked bars

export function StackedBars({
  months,
  parts,
  label,
  height = 150,
}: {
  months: { label: string; values: number[] }[]
  parts: { name: string; color: string }[]
  label: string
  height?: number
}) {
  const W = 480
  const pad = { l: 6, r: 6, t: 8, b: 24 }
  const iw = W - pad.l - pad.r
  const ih = height - pad.t - pad.b
  const n = Math.max(1, months.length)
  const slot = iw / n
  const bw = Math.min(slot * 0.7, 28)
  const max = Math.max(1, ...months.map((m) => m.values.reduce((a, b) => a + b, 0)))
  return (
    <figure style={{ margin: 0 }}>
      <svg className="gv-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
        <title>{label}</title>
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke={C.grid} />
        {months.map((m, i) => {
          const cx = pad.l + slot * i + slot / 2
          let acc = 0
          return (
            <g key={m.label + i}>
              {m.values.map((v, p) => {
                const h = (v / max) * ih
                const yy = pad.t + ih - acc - h
                acc += h
                return h > 0 ? <rect key={p} x={cx - bw / 2} y={yy} width={bw} height={h} fill={parts[p]?.color} stroke="#faf5ef" strokeWidth="1" /> : null
              })}
              {i % 2 === 0 || i === n - 1 ? (
                <text x={cx} y={height - 7} textAnchor="middle">
                  {m.label}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      <figcaption className="gv-chart-legend">
        {parts.map((p) => (
          <span key={p.name}>
            <LegendMarker kind="bar" color={p.color} />
            {p.name}
          </span>
        ))}
      </figcaption>
      <SrTable caption={label} headers={['Month', ...parts.map((p) => p.name)]} rows={months.map((m) => [m.label, ...m.values])} />
    </figure>
  )
}

// ---------------------------------------------------------------- horizontal bars with a status word

export interface HBarRow {
  label: string
  value: number
  max: number
  display: string
  /** Word shown with the colour, so status is never colour only. */
  status?: string
  color?: string
}

export function HBars({ rows, label }: { rows: HBarRow[]; label: string }) {
  return (
    <ul className="gv-hbars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.label} className="gv-hbar">
          <span className="gv-strong">{r.label}</span>
          <span className="gv-hbar-track" aria-hidden="true">
            <span className="gv-hbar-fill" style={{ width: `${Math.max(3, Math.min(100, (r.value / Math.max(1, r.max)) * 100))}%`, background: r.color ?? C.tealSoft }} />
          </span>
          <span className="gv-num" style={{ textAlign: 'right' }}>
            {r.display}
            {r.status ? <span className="cf-sr"> ({r.status})</span> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Simple labelled meter row used for funnels. */
export function FunnelBars({ rows, label }: { rows: { label: string; count: number }[]; label: string }) {
  const first = Math.max(1, rows[0]?.count ?? 1)
  return (
    <ul className="gv-hbars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.label} className="gv-hbar" style={{ gridTemplateColumns: '140px minmax(0,1fr) 80px' }}>
          <span className="gv-strong">{r.label}</span>
          <span className="gv-hbar-track" aria-hidden="true">
            <span className="gv-hbar-fill" style={{ width: `${(r.count / first) * 100}%`, background: C.tealSoft }} />
          </span>
          <span className="gv-num" style={{ textAlign: 'right' }}>
            {r.count.toLocaleString('en-IN')} · {Math.round((r.count / first) * 100)}%
          </span>
        </li>
      ))}
    </ul>
  )
}
