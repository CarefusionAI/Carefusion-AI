import { useId } from 'react'
import type { GovLevel, GovUnit } from '@carefusion/shared'
import { TILE_LAYOUT } from './tileLayout'

// SVG tile map: one tile per block, district or state, placed on the design's hand-drawn grid.
// Each tile shows its code and number, so colour is never the only cue. Outbreak watch tiles also
// get a dashed border and a "!" mark. Tiles are buttons (Enter or Space) with a full spoken label.

export interface TileCell {
  /** 0 to 4, or null when the metric is not available for this unit */
  level: number | null
  /** short text in the tile, for example "93%" */
  value: string
  /** spoken value, for example "93 percent registered" */
  spoken: string
}

export const PALETTES: Record<'registered' | 'disease' | 'blood', { fill: string; text: string }[]> = {
  registered: [
    { fill: '#efe7de', text: '#2e3f4c' },
    { fill: '#d7e9e6', text: '#2e3f4c' },
    { fill: '#b5d6d2', text: '#2e3f4c' },
    { fill: '#86bdb8', text: '#1f2f3a' },
    { fill: '#3a726d', text: '#faf5ef' },
  ],
  disease: [
    { fill: '#dcebe0', text: '#2e3f4c' },
    { fill: '#f6e9cf', text: '#2e3f4c' },
    { fill: '#f5e1d8', text: '#2e3f4c' },
    { fill: '#eec3b8', text: '#2e3f4c' },
    { fill: '#e3a9a3', text: '#2e3f4c' },
  ],
  blood: [
    { fill: '#dcebe0', text: '#2e3f4c' },
    { fill: '#f6e9cf', text: '#2e3f4c' },
    { fill: '#f5e1d8', text: '#2e3f4c' },
    { fill: '#eec3b8', text: '#2e3f4c' },
    { fill: '#e3a9a3', text: '#2e3f4c' },
  ],
}

export function TileMap({
  level,
  units,
  cellOf,
  palette,
  selectedId,
  onSelect,
  label,
}: {
  level: GovLevel
  units: GovUnit[]
  cellOf: (u: GovUnit) => TileCell
  palette: 'registered' | 'disease' | 'blood'
  selectedId: string | null
  onSelect: (id: string) => void
  label: string
}) {
  const uid = useId().replace(/:/g, '')
  const layout = TILE_LAYOUT[level]
  const dense = layout.cols >= 7
  const cw = dense ? 88 : 118
  const ch = dense ? 58 : 80
  const gap = dense ? 6 : 8

  // Place every unit. A unit the layout does not know goes into extra rows underneath.
  const placed: { u: GovUnit; col: number; row: number }[] = []
  let extra = 0
  for (const u of units) {
    const spot = layout.tiles[u.name]
    if (spot) placed.push({ u, col: spot[0], row: spot[1] })
    else {
      placed.push({ u, col: extra % layout.cols, row: layout.rows + Math.floor(extra / layout.cols) })
      extra++
    }
  }
  const rows = Math.max(layout.rows, ...placed.map((p) => p.row + 1))
  const W = layout.cols * (cw + gap) - gap
  const H = rows * (ch + gap) - gap
  const pal = PALETTES[palette]

  return (
    <svg className="gv-mapsvg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={label}>
      <defs>
        <pattern id={`na-${uid}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#efe7de" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#d6cec6" strokeWidth="2" />
        </pattern>
      </defs>
      {placed.map(({ u, col, row }) => {
        const cell = cellOf(u)
        const x = col * (cw + gap)
        const y = row * (ch + gap)
        const sel = u.id === selectedId
        const colours = cell.level === null ? null : pal[cell.level]
        const spoken = `${u.name}. ${cell.spoken}${u.hot ? '. Outbreak watch' : ''}${u.status === 'low_blood' ? '. Low blood stock' : ''}`
        return (
          <g
            key={u.id}
            className="gv-tile-g"
            role="button"
            tabIndex={0}
            aria-pressed={sel}
            aria-label={spoken}
            transform={`translate(${x},${y})`}
            onClick={() => onSelect(u.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(u.id)
              }
            }}
          >
            <title>{`${u.name} · ${cell.value}`}</title>
            <rect
              className="gv-tile-r"
              width={cw}
              height={ch}
              rx={dense ? 8 : 12}
              fill={colours ? colours.fill : `url(#na-${uid})`}
              stroke={u.hot ? '#9a4a46' : 'transparent'}
              strokeWidth={u.hot ? 2.5 : 1}
              strokeDasharray={u.hot ? '6 3' : undefined}
            />
            {sel ? <rect className="gv-tile-sel" width={cw} height={ch} rx={dense ? 8 : 12} fill="none" stroke="#3f5263" strokeWidth="3" /> : null}
            <text className="gv-tile-code" x={dense ? 8 : 10} y={dense ? 19 : 22} fontSize={dense ? 13 : 14} style={colours ? { fill: colours.text } : undefined}>
              {u.code}
            </text>
            {u.hot ? (
              <text x={cw - 10} y={dense ? 19 : 22} textAnchor="end" fontSize="14" fontWeight="700" fill="#9a4a46" aria-hidden="true">
                !
              </text>
            ) : null}
            {!dense ? (
              <text className="gv-tile-name" x="10" y="44" fontSize="12.5" style={colours ? { fill: colours.text } : undefined}>
                {u.name.length > 14 ? `${u.name.slice(0, 13)}…` : u.name}
              </text>
            ) : null}
            <text
              className="gv-tile-val"
              x={dense ? 8 : 10}
              y={dense ? 44 : 66}
              fontSize={dense ? 13 : 14}
              style={colours ? { fill: colours.text } : undefined}
            >
              {cell.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
